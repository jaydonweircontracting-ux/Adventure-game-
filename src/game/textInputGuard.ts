// Text input guard (BUILD 667).
// Prevents game keybinds from firing while the player is typing in a text field.
// Single shared helper — use at the top of every global keyboard handler.

/**
 * Returns true if the keyboard event originated from (or is intended for)
 * a text-editing control. When true, game keybinds must not fire.
 *
 * Checks:
 * - event.target: input (text-like types), textarea, contenteditable
 * - document.activeElement: fallback for cases where target is detached
 */
export function isTextInputActive(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  const active = document.activeElement as HTMLElement | null;

  const isEditable = (el: HTMLElement | null): boolean => {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const type = (el as HTMLInputElement).type.toLowerCase();
      // Text-like inputs that need normal keyboard behavior.
      // Exclude checkbox, radio, file, button, submit, etc.
      return ['text', 'search', 'email', 'number', 'password', 'tel', 'url'].includes(type);
    }
    if (el.isContentEditable) return true;
    // Check if inside a contenteditable.
    if (el.closest && el.closest('[contenteditable="true"]')) return true;
    return false;
  };

  return isEditable(target) || isEditable(active);
}
