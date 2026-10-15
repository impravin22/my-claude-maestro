// An animated product component: it needs a row.
export function Panel({ open }: { open: boolean }) {
  return <div className={open ? "anim-enter" : "anim-exit"} />;
}
