import { useCallback, useEffect, useState } from 'react';

/** Finds an enabled button by its text, ignoring case so a label's capitalization can change freely. */
function labeledButton(root: ParentNode, label: string): HTMLButtonElement | null {
  const wanted = label.toLowerCase();
  for (const node of root.querySelectorAll('button')) {
    if (node instanceof HTMLButtonElement && !node.disabled && node.textContent?.trim().toLowerCase() === wanted) {
      return node;
    }
  }
  return null;
}

function actionButton(target: EventTarget | null, section: HTMLElement): HTMLButtonElement | null {
  const saveRoot = target instanceof Element ? target.closest('[data-inline-save]') : null;
  if (saveRoot && section.contains(saveRoot)) {
    const scoped = labeledButton(saveRoot, 'Save');
    if (scoped) return scoped;
  }
  return labeledButton(section, 'Save') ?? labeledButton(section, 'Apply changes');
}

export function useSectionEditKeys(enabled: boolean, onDiscard: () => void, hasChanges: boolean) {
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!enabled) setConfirmCancel(false);
  }, [enabled]);

  const keepEditing = useCallback(() => setConfirmCancel(false), []);

  const discard = useCallback(() => {
    setConfirmCancel(false);
    onDiscard();
  }, [onDiscard]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!enabled || confirmCancel || event.nativeEvent.isComposing) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!hasChanges) {
        onDiscard();
        return;
      }
      setConfirmCancel(true);
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName === 'TEXTAREA' || target.closest('button, a')) return;

    const button = actionButton(target, event.currentTarget);
    if (!button) return;
    event.preventDefault();
    button.click();
  };

  return { confirmCancel, keepEditing, discard, onKeyDown };
}
