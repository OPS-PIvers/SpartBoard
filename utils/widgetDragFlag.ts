export function beginWidgetDrag(): void {
  document.body.classList.add('is-dragging-widget');
}

export function endWidgetDrag(): void {
  document.body.classList.remove('is-dragging-widget');
}
