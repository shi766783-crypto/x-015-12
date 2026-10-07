import { computed, reactive } from 'vue'
import { createStorage } from '../services/storage'
import { config, seed, recommendedDate } from '../data'

const storage = createStorage(config.storageKey, seed)
const latestDate = (a, b) => (!a || (b && b > a) ? b : a)
export function useKeeper() {
  const state = reactive(storage.read())
  const persist = () => storage.write(state)
  const add = (collection, item) => { state[collection].unshift({ id: `${collection}-${Date.now()}`, createdAt: new Date().toISOString(), ...item }); persist() }
  const update = (collection, id, patch) => { const item = state[collection].find((entry) => entry.id === id); if (item) Object.assign(item, patch); persist() }
  const remove = (collection, id) => { state[collection] = state[collection].filter((entry) => entry.id !== id); persist() }
  const reset = () => { Object.assign(state, structuredClone(seed)); persist() }
  // 登记一次烹饪：写入烹饪记录，并把菜谱的最近烹饪日期 / 下次推荐日期联动更新
  const logCooking = (entry) => {
    const doc = state.documents.find((x) => x.id === entry.documentId)
    const date = entry.date || new Date().toISOString().slice(0, 10)
    add('usages', { purpose: '', borrower: '', status: '完成', score: 0, note: '', ...entry, date })
    if (!doc) return
    // 最近烹饪日期只随实际更新的记录前进，同一天多次烹饪不会反复叠加间隔
    const issued = latestDate(doc.issued, date)
    const patch = { issued }
    if (entry.expires) {
      // 用户本次手动指定推荐日期：以用户输入为准
      patch.expires = entry.expires
      patch.expiresManual = true
    } else if (!doc.expiresManual) {
      // 自动推算：从最近烹饪日期向后推一个合理间隔
      const next = recommendedDate(issued)
      // 旧数据里已有的推荐日期若比自动值更晚（例如提前安排过），不予无故覆盖
      if (!doc.expires || next > doc.expires) patch.expires = next
    }
    update('documents', doc.id, patch)
  }
  const metrics = computed(() => config.metrics.map((metric) => ({ ...metric, value: metric.value ? metric.value(state) : state[metric.collection]?.length || 0 })))
  return { state, add, update, remove, reset, persist, logCooking, metrics }
}
