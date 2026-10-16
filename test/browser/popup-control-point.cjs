// Native popup targets appear before their async page list has rendered.
// A hidden control has a 0×0 rectangle: never turn that into a click at (0, 0).
// Keep this function self-contained so CDP can evaluate it inside the popup.
function popupControlPoint(element) {
  if (!element || element.disabled) return null;
  const rect = element.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return null;
  const point = { x:rect.x + rect.width / 2, y:rect.y + rect.height / 2 };
  const target = element.ownerDocument.elementFromPoint(point.x, point.y);
  if (target !== element && !element.contains(target)) return null;
  return point;
}

module.exports = { popupControlPoint };
