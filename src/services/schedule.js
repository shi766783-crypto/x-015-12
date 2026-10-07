import { config, today } from '../data'

// 日期统一按本地时区处理成 YYYY-MM-DD，避免 toISOString 的时区偏移
const pad = (n) => String(n).padStart(2, '0')
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (date, n) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + n); return toISO(d) }

// 取这道菜此前的烹饪日期（升序、去重），同一天多次烹饪只算一次
const cookedDates = (state, documentId, beforeDate) => {
  const dates = state.usages
    .filter((x) => x.documentId === documentId && x.date && (!beforeDate || x.date <= beforeDate))
    .map((x) => x.date)
  return [...new Set(dates)].sort()
}

// 根据历史烹饪间隔推算"合理间隔"：
// 有两次以上记录时取相邻间隔的平均值，否则用默认周期；结果夹在上下限之间
export function suggestInterval(state, documentId, cookedDate = today) {
  const dates = cookedDates(state, documentId, cookedDate)
  const gaps = dates.slice(1).map((date, i) => Math.round((new Date(`${date}T00:00:00`) - new Date(`${dates[i]}T00:00:00`)) / 86400000))
  const positive = gaps.filter((gap) => gap > 0)
  const base = positive.length ? positive.reduce((a, b) => a + b, 0) / positive.length : config.recommend.defaultInterval
  return Math.min(config.recommend.maxInterval, Math.max(config.recommend.minInterval, Math.round(base)))
}

// 以本次烹饪日期为基准，往后推一个合理间隔
export function suggestNext(state, documentId, cookedDate = today) {
  return addDays(cookedDate, suggestInterval(state, documentId, cookedDate))
}
