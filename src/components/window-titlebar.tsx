import { useEffect, useState } from "react"
import {
  ChevronsDown,
  Copy,
  Maximize2,
  Minus,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import appIcon from "@/assets/app-icon.png"

export function WindowTitlebar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.authorDesk.window.getState().then((state) => setIsMaximized(state.isMaximized))
    return window.authorDesk.window.onStateChange((state) => {
      setIsMaximized(state.isMaximized)
    })
  }, [])

  return (
    <header className="window-drag relative z-50 flex h-12 shrink-0 items-center border-b border-border bg-white px-3">
      <div className="flex items-center gap-2">
        <img
          src={appIcon}
          alt=""
          className="size-7 rounded-lg shadow-sm"
        />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          作者管家
        </span>
        <span className="text-xs text-muted-foreground">|&nbsp; 作家专区</span>
      </div>

      <div className="window-no-drag ml-auto flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          title="隐藏到后台托盘"
          aria-label="隐藏到后台托盘"
          className="h-9 w-10"
          onClick={() => window.authorDesk.window.hideToTray()}
        >
          <ChevronsDown className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="最小化"
          aria-label="最小化窗口"
          className="h-9 w-10"
          onClick={() => window.authorDesk.window.minimize()}
        >
          <Minus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={isMaximized ? "还原" : "最大化"}
          aria-label={isMaximized ? "还原窗口" : "最大化窗口"}
          className="h-9 w-10"
          onClick={() => window.authorDesk.window.toggleMaximize()}
        >
          {isMaximized ? <Copy className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="关闭"
          aria-label="关闭窗口"
          className={cn("h-9 w-10 hover:bg-red-500 hover:text-white")}
          onClick={() => window.authorDesk.window.close()}
        >
          <X className="size-4" />
        </Button>
      </div>
    </header>
  )
}
