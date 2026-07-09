import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon, TvMinimalPlayIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PlayerView } from '@/components/PlayerView'
import { useAppStore } from '@/store'

export default function PlayerPage() {
  const { avid = '' } = useParams()
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const { report, source, connection, packageName } = useAppStore()

  const playlist = useMemo(
    () => (report ? report.items.filter((i) => i.avid === avid) : []),
    [report, avid],
  )
  const startIndex = Math.max(0, Math.min(playlist.length - 1, Number(sp.get('i') ?? 0) || 0))

  // 没有报告（如刷新丢失内存态）或找不到该投稿：提示返回
  if (!report || playlist.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
          <TvMinimalPlayIcon className="size-6" />
        </div>
        <div>
          <div className="font-medium">没有可播放的内容</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {report ? '未找到该视频，可能已返回首页重新扫描。' : '播放数据来自内存，刷新后需返回首页重新连接/扫描。'}
          </p>
        </div>
        <Button onClick={() => navigate('/')} className="gap-1.5">
          <ArrowLeftIcon className="size-4" />
          返回首页
        </Button>
      </div>
    )
  }

  return (
    <PlayerView
      playlist={playlist}
      startIndex={startIndex}
      source={source ?? 'sample'}
      connection={connection}
      packageName={packageName}
      onBack={() => navigate('/')}
    />
  )
}
