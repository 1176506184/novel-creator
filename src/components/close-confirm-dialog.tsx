import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ChevronsDown,
  Power,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"

type CloseConfirmDialogProps = {
  hasUnsavedChanges: boolean
}

export function CloseConfirmDialog({
  hasUnsavedChanges,
}: CloseConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [remember, setRemember] = useState(false)
  const [isResolving, setIsResolving] = useState(false)

  useEffect(() => window.authorDesk.window.onCloseRequested(() => {
    setRemember(false)
    setOpen(true)
  }), [])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isResolving) setOpen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isResolving, open])

  async function resolveClose(action: "tray" | "quit") {
    if (isResolving) return
    setIsResolving(true)
    try {
      await window.authorDesk.window.resolveClose(action, remember)
      if (remember) {
        window.dispatchEvent(new CustomEvent("author-desk:close-behavior-changed", {
          detail: action,
        }))
      }
      if (action === "tray") setOpen(false)
    } finally {
      setIsResolving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/25 p-5 backdrop-blur-[3px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isResolving) setOpen(false)
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-confirm-title"
        aria-describedby="close-confirm-description"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-white shadow-[0_28px_90px_rgba(44,25,17,0.2)]"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
            <Power className="size-4.5" />
          </div>
          <div>
            <h2 id="close-confirm-title" className="text-sm font-semibold">关闭作者管家</h2>
            <p id="close-confirm-description" className="mt-1 text-[11px] text-muted-foreground">
              请选择退出程序，或保留在后台继续运行
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label="取消关闭"
            disabled={isResolving}
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="p-5">
          {hasUnsavedChanges && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p className="text-xs leading-5">
                当前正文还有未保存修改。放到后台会保留编辑状态；直接退出程序将丢失这些修改。
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="group rounded-xl border border-border bg-white p-4 text-left outline-none transition-[border-color,background-color,box-shadow] hover:border-primary/30 hover:bg-secondary/35 focus-visible:ring-3 focus-visible:ring-primary/15 disabled:opacity-60"
              disabled={isResolving}
              onClick={() => resolveClose("tray")}
            >
              <span className="grid size-9 place-items-center rounded-lg bg-secondary text-primary">
                <ChevronsDown className="size-4" />
              </span>
              <span className="mt-3 block text-sm font-semibold">放到后台</span>
              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                保留当前状态，可从托盘再次打开
              </span>
            </button>

            <button
              type="button"
              className="group rounded-xl border border-border bg-white p-4 text-left outline-none transition-[border-color,background-color,box-shadow] hover:border-red-200 hover:bg-red-50/65 focus-visible:ring-3 focus-visible:ring-red-100 disabled:opacity-60"
              disabled={isResolving}
              onClick={() => resolveClose("quit")}
            >
              <span className="grid size-9 place-items-center rounded-lg bg-red-50 text-red-600">
                <Power className="size-4" />
              </span>
              <span className="mt-3 block text-sm font-semibold">退出程序</span>
              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                结束本地服务并退出作者管家
              </span>
            </button>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg bg-muted/40 px-3.5 py-3">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="mt-0.5 size-4 rounded border-input accent-primary"
            />
            <span>
              <span className="block text-xs font-medium">记住我的选择</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                下次关闭将直接执行，可随时在设置中改回“每次询问”。
              </span>
            </span>
          </label>
        </div>

        <footer className="flex justify-end border-t border-border bg-muted/25 px-5 py-3">
          <Button variant="ghost" disabled={isResolving} onClick={() => setOpen(false)}>
            取消
          </Button>
        </footer>
      </section>
    </div>
  )
}
