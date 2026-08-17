import { Mic, SendHorizontal, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  value: string;
  listening: boolean;
  disabled: boolean;
  onChange: (v: string) => void;
  onSend: () => void;
  onToggleListen: () => void;
};

export function Composer({
  open,
  value,
  listening,
  disabled,
  onChange,
  onSend,
  onToggleListen,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  return (
    <form
      aria-hidden={!open}
      className={cn(
        "flex w-full items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-xl",
        "transition-[opacity,transform,filter] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]",
        open
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100 blur-0"
          : "pointer-events-none translate-y-1.5 scale-[0.98] opacity-0 blur-[2px]",
      )}
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <Button
        type="button"
        variant={listening ? "default" : "ghost"}
        size="icon"
        tabIndex={open ? 0 : -1}
        aria-label={listening ? "Stop transcription" : "Transcribe"}
        onClick={onToggleListen}
      >
        {listening ? <Square className="size-4" /> : <Mic className="size-4" />}
      </Button>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        disabled={disabled}
        tabIndex={open ? 0 : -1}
        placeholder="Edit, then send"
        className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-sm text-fg outline-none placeholder:text-subtle"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <Button
        type="submit"
        size="icon"
        tabIndex={open ? 0 : -1}
        disabled={disabled || !value.trim()}
        aria-label="Send"
      >
        <SendHorizontal className="size-4" />
      </Button>
    </form>
  );
}
