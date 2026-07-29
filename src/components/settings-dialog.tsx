import { useEffect } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SettingsPage } from "@/pages/settings-page"
import type { LibraryState } from "@/types/library"

type SettingsDialogProps = {
  open: boolean
  library: LibraryState
  isChoosingLibrary: boolean
  onChooseLibrary: () => Promise<void>
  onClose: () => void
}

export function SettingsDialog({
  open,
  library,
  isChoosingLibrary,
  onChooseLibrary,
  onClose,
}: SettingsDialogProps) {
  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isChoosingLibrary) onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isChoosingLibrary, onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isChoosingLibrary) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        className="relative h-[min(820px,calc(100vh-40px))] w-[min(1080px,calc(100vw-40px))] overflow-hidden rounded-2xl border border-border bg-canvas shadow-[0_28px_90px_rgba(44,25,17,0.18)]"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute right-5 top-5 z-10 bg-white/85 shadow-sm backdrop-blur"
          aria-label="关闭设置"
          title="关闭"
          disabled={isChoosingLibrary}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>

        <div className="h-full overflow-y-auto">
          <SettingsPage
            library={library}
            isChoosingLibrary={isChoosingLibrary}
            onChooseLibrary={onChooseLibrary}
          />
        </div>
      </section>
    </div>
  )
}
