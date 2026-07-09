import { createContext, useContext } from 'react'
import type { CacheReport } from '@/lib/bili'
import type { Connection } from '@/lib/adb'

/** 跨路由共享的应用状态（连接与报告是内存态，无法进 URL）。 */
export interface AppStore {
  report: CacheReport | null
  source: 'device' | 'sample' | null
  connection: Connection | null
  packageName: string
}

export const AppContext = createContext<AppStore>({
  report: null,
  source: null,
  connection: null,
  packageName: 'tv.danmaku.bilj',
})

export const useAppStore = () => useContext(AppContext)
