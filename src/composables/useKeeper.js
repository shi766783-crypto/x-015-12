import { computed, reactive } from 'vue'
import { createStorage } from '../services/storage'
import { addDays, suggestNext } from '../services/schedule'
import { config, seed } from '../data'

const storage = createStorage(config.storageKey, seed)
export function useKeeper() {
  const state = reactive(storage.read())
  const persist = () => storage.write(state)
  const add = (collection, item) => {
    let entry = item
    // 新菜谱：下次推荐日期默认跟随最近烹饪日期往后推一个周期，用户已手填则尊重手填
    if (collection === 'documents' && item.issued && !item.expires) {
      entry = { ...item, expires: addDays(item.issued, config.recommend.defaultInterval) }
    }
    state[collection].unshift({ id: `${collection}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString(), ...entry }); persist()
  }
  const update = (collection, id, patch) => { const item = state[collection].find((entry) => entry.id === id); if (item) Object.assign(item, patch); persist() }
  const remove = (collection, id) => { state[collection] = state[collection].filter((entry) => entry.id !== id); persist() }
  // 登记一次烹饪：追加烹饪记录，并把菜谱的最近烹饪日期推进到本次日期。
  // 下次推荐日期仅在用户没有手动指定时，才按本次日期自动顺延（同一天重复登记时重新顺延）。
  const logCooking = ({ documentId, date, expires, ...rest }) => {
    const recipe = state.documents.find((x) => x.id === documentId)
    if (!recipe) return
    state.usages.unshift({ id: `cook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, documentId, date, status: '完成', score: 0, ...rest })
    const patch = {}
    if (!recipe.issued || date > recipe.issued) patch.issued = date
    // 用户手动指定则原样采用，否则按本次烹饪日期自动顺延
    patch.expires = expires || suggestNext(state, documentId, date)
    Object.assign(recipe, patch)
    persist()
  }
  const reset = () => { Object.assign(state, structuredClone(seed)); persist() }
  const metrics = computed(() => config.metrics.map((metric) => ({ ...metric, value: metric.value ? metric.value(state) : state[metric.collection]?.length || 0 })))
  return { state, add, update, remove, logCooking, reset, persist, metrics }
}
