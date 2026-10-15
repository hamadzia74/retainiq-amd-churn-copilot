export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-amd text-sm font-bold text-white">R</div>
      <div className="leading-tight">
        <p className="font-semibold text-strong">RetainIQ</p>
        <p className="text-[11px] text-muted">Northwind Outfitters</p>
      </div>
    </div>
  );
}
