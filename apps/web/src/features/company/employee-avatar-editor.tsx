import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip";
import { EmployeeCardButton } from "./employee-card-ui";

export function EmployeeAvatarEditor({ initialImage, fallback }: { initialImage?: string; fallback: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState(initialImage);
  const [original, setOriginal] = useState(initialImage);
  const [savedCrop, setSavedCrop] = useState({ zoom: 1, x: 0, y: 0 });
  const [draft, setDraft] = useState<string>();
  const [crop, setCrop] = useState({ zoom: 1, x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 192, height: 192 });
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | undefined>(undefined);
  const baseScale = 192 / Math.min(dimensions.width, dimensions.height);
  function constrain(next: typeof crop) {
    const maxX = (dimensions.width * baseScale * next.zoom - 192) / 2;
    const maxY = (dimensions.height * baseScale * next.zoom - 192) / 2;
    return { zoom: next.zoom, x: Math.max(-maxX, Math.min(maxX, next.x)), y: Math.max(-maxY, Math.min(maxY, next.y)) };
  }
  useEffect(() => {
    const element = frame;
    if (!element || !draft) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 192 : 1);
      setCrop((current) => {
        const zoom = Math.max(1, Math.min(5, current.zoom * Math.exp(-delta * 0.002)));
        return constrain({ zoom, x: current.x * zoom / current.zoom, y: current.y * zoom / current.zoom });
      });
    }
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [frame, draft, dimensions.width, dimensions.height]);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLImageElement>(null);
  function edit(source: string) {
    setCrop({ zoom: 1, x: 0, y: 0 });
    setError("");
    setDraft(source);
  }
  function save() {
    if (!draft) {
      setPhoto(undefined);
      setOriginal(undefined);
      setSavedCrop({ zoom: 1, x: 0, y: 0 });
      setOpen(false);
      return;
    }
    const image = preview.current;
    if (!image?.naturalWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) return;
    const side = Math.min(image.naturalWidth, image.naturalHeight) / crop.zoom;
    context.drawImage(image, (image.naturalWidth - side) / 2 - crop.x / (baseScale * crop.zoom), (image.naturalHeight - side) / 2 - crop.y / (baseScale * crop.zoom), side, side, 0, 0, 256, 256);
    setPhoto(canvas.toDataURL("image/webp"));
    setOriginal(draft);
    setSavedCrop(crop);
    setOpen(false);
  }
  return (
    <>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Выбрать фотографию" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
          setError("Выберите JPG, PNG или WebP до 10 МБ.");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => edit(String(reader.result));
        reader.onerror = () => setError("Не удалось прочитать фотографию.");
        reader.readAsDataURL(file);
      }} />
      <button type="button" onClick={() => { edit(original ?? ""); setCrop(savedCrop); setOpen(true); }} className="group relative size-10 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Изменить фото сотрудника">
          {photo ? <img src={photo} alt="" className="size-full rounded-full object-cover" /> : fallback}
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
            <Camera className="size-4" aria-hidden="true" />
          </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="w-[calc(100%-2rem)] sm:max-w-sm">
          <DialogHeader className="text-center">
            <DialogTitle className="leading-6">Фото сотрудника</DialogTitle>
          </DialogHeader>
          <div className="relative mx-auto size-48">
          <div ref={setFrame} className={`relative mx-auto size-48 touch-none overflow-hidden rounded-full bg-muted ${draft ? "cursor-grab active:cursor-grabbing" : ""}`}
            onPointerDown={(event) => {
              if (!draft || event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
            }}
            onPointerMove={(event) => {
              const previous = drag.current;
              if (!previous || previous.id !== event.pointerId) return;
              const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
              drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
              setCrop((current) => constrain({ ...current, x: current.x + dx, y: current.y + dy }));
            }}
            onPointerUp={() => { drag.current = undefined; }}
            onPointerCancel={() => { drag.current = undefined; }}
            onLostPointerCapture={() => { drag.current = undefined; }}
          >
            {draft ? <img ref={preview} src={draft} draggable={false} alt="Предпросмотр фотографии" className="pointer-events-none absolute max-w-none select-none"
              style={{ width: dimensions.width * baseScale * crop.zoom, height: dimensions.height * baseScale * crop.zoom, left: "50%", top: "50%", transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px))` }}
              onError={() => setError("Не удалось открыть изображение.")}
              onLoad={(event) => { setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setError(""); }} />
              : <button type="button" className="flex size-full cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label="Загрузить фото" onClick={() => input.current?.click()}><Camera className="size-10" aria-hidden="true" /></button>}
          </div>
            <div className="pointer-events-none absolute inset-0">
                <Tooltip><TooltipTrigger delay={800} render={<EmployeeCardButton variant="ghost" className="pointer-events-auto absolute right-[2.6px] bottom-[23.2px] size-7 rounded-full border bg-card px-0 shadow-sm hover:bg-muted" aria-label={draft ? "Заменить фото" : "Загрузить фото"} onClick={() => input.current?.click()} />}> <ImagePlus aria-hidden="true" /></TooltipTrigger><TooltipContent side="right">{draft ? "Заменить фото" : "Загрузить фото"}</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger delay={800} render={<EmployeeCardButton variant="ghost" className="pointer-events-auto absolute right-5 bottom-0 size-7 rounded-full border bg-card px-0 text-destructive shadow-sm hover:bg-muted hover:text-destructive" disabled={!draft} aria-label="Удалить фото" onClick={() => { setDraft(""); setError(""); }} />}> <Trash2 aria-hidden="true" /></TooltipTrigger><TooltipContent side="right">Удалить фото</TooltipContent></Tooltip>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {draft ? "Перетаскивайте фото. Колесо мыши изменяет масштаб." : "Загрузите фотографию."}
          </p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="grid grid-cols-2 *:w-full">
            <EmployeeCardButton disabled={!!error} onClick={save}>Сохранить</EmployeeCardButton>
            <EmployeeCardButton variant="outline" onClick={() => setOpen(false)}>Отмена</EmployeeCardButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
