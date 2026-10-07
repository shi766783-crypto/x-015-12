// 临时验证脚本：node scripts/test-schedule.mjs（通过 vite 的模块解析运行）
import assert from 'node:assert'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' })
const { suggestNext, suggestInterval, addDays } = await server.ssrLoadModule('/src/services/schedule.js')

const mk = (usages) => ({ usages: usages.map((date, i) => ({ id: `u${i}`, documentId: 'r1', date })) })

// 1. 无历史：默认 30 天
assert.equal(suggestNext(mk([]), 'r1', '2026-10-01'), '2026-10-31')

// 2. 有历史：取相邻间隔平均值（31 天周期）
assert.equal(suggestNext(mk(['2026-08-01', '2026-09-01', '2026-10-01']), 'r1', '2026-10-01'), '2026-11-01')

// 3. 同一天多次烹饪：去重后间隔不被污染，结果与单次一致
const once = suggestNext(mk(['2026-08-01', '2026-09-01', '2026-10-01']), 'r1', '2026-10-01')
const twice = suggestNext(mk(['2026-08-01', '2026-09-01', '2026-10-01', '2026-10-01', '2026-10-01']), 'r1', '2026-10-01')
assert.equal(once, twice)
assert.equal(twice, '2026-11-01')

// 4. 间隔上下限：过大夹到 90，过小夹到 7
assert.equal(suggestInterval(mk(['2020-01-01', '2026-10-01']), 'r1', '2026-10-01'), 90)
assert.equal(suggestInterval(mk(['2026-10-01', '2026-10-02']), 'r1', '2026-10-02'), 7)

// 5. 跨月 / 跨年加法正确
assert.equal(addDays('2026-10-31', 1), '2026-11-01')
assert.equal(addDays('2026-12-31', 1), '2027-01-01')

// 6. 平均值取整（20 天与 40 天 → 30）
assert.equal(suggestInterval(mk(['2026-08-01', '2026-08-21', '2026-09-30']), 'r1', '2026-09-30'), 30)

// ---- composable 集成：旧数据保护 / 手动指定 / 同日多次 ----
const store = new Map()
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) }
const { useKeeper } = await server.ssrLoadModule('/src/composables/useKeeper.js')
const { state, logCooking, add } = useKeeper()
const tomato = state.documents.find((x) => x.name === '番茄牛腩') // issued 2026-09-12, expires 2026-10-12

// 7. 同一天重复登记烹饪：不改动"最近烹饪日期"，推荐日期以当天为基准重新顺延
logCooking({ documentId: tomato.id, date: '2026-09-12', purpose: '补登记' })
assert.equal(tomato.issued, '2026-09-12')
assert.equal(state.usages.filter((x) => x.documentId === tomato.id && x.date === '2026-09-12').length, 2)
assert.ok(tomato.expires > '2026-09-12', '同日再做也应把推荐日期顺延')
const afterSameDay = tomato.expires

// 8. 普通一次烹饪：最近烹饪日期推进，推荐日期跟随更新
logCooking({ documentId: tomato.id, date: '2026-10-20' })
assert.equal(tomato.issued, '2026-10-20')
assert.ok(tomato.expires > '2026-10-20')
assert.notEqual(tomato.expires, afterSameDay)

// 9. 手动指定推荐日期：必须原样保留，不被自动推算覆盖
logCooking({ documentId: tomato.id, date: '2026-11-01', expires: '2026-12-25' })
assert.equal(tomato.issued, '2026-11-01')
assert.equal(tomato.expires, '2026-12-25')

// 10. 旧数据保护：从不调用 logCooking 的菜谱，其已有推荐日期绝不被改写
const noodle = state.documents.find((x) => x.name === '葱油拌面')
assert.equal(noodle.expires, '2026-11-01')
assert.equal(noodle.issued, '2026-09-15')

// 11. 新建菜谱：手填 expires 受尊重；不填时随 issued 自动顺延
add('documents', { name: '手动测试菜', issued: '2026-10-01', expires: '2027-01-20' })
assert.equal(state.documents[0].expires, '2027-01-20')
add('documents', { name: '自动测试菜', issued: '2026-10-01' })
assert.equal(state.documents[0].expires, '2026-10-31')

await server.close()
console.log('schedule + keeper logic OK')
