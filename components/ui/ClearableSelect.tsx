'use client';

import React from 'react';
import { undoKeyAction, useUndoHistory } from '@/components/ui/undo-history';
import { OptionMenu, type MenuOption } from '@/components/ui/option-menu';

type ClearableSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'children'> & {
  /** Value left behind by Delete or Backspace. Defaults to blank. */
  clearValue?: string;
  /** A blank value can be cleared to. The menu lists a blank option only when one is passed in. */
  allowBlank?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  children?: React.ReactNode;
};

function optionLabel(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(optionLabel).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return optionLabel(node.props.children);
  return '';
}

function optionsFromChildren(children: React.ReactNode): MenuOption[] {
  const options: MenuOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: string | number; children?: React.ReactNode; hidden?: boolean; disabled?: boolean }>(child)) return;
    // The menu has no group headings; an <optgroup>'s options are listed in place.
    if (child.type === 'optgroup') {
      options.push(...optionsFromChildren(child.props.children));
      return;
    }
    if (child.type !== 'option' || child.props.hidden) return;
    const label = optionLabel(child.props.children);
    const raw = child.props.value ?? label;
    options.push({ value: String(raw), label: label || String(raw), disabled: Boolean(child.props.disabled) });
  });
  return options;
}

function emitChange(onChange: ClearableSelectProps['onChange'], value: string) {
  onChange?.({ target: { value }, currentTarget: { value } } as React.ChangeEvent<HTMLSelectElement>);
}

export function ClearableSelect({
  onKeyDown,
  onChange,
  children,
  clearValue = '',
  allowBlank = true,
  value,
  className,
  disabled,
  id,
  required,
  tabIndex,
  title,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
}: ClearableSelectProps) {
    void allowBlank;
  const history = useUndoHistory();
    const current = value == null ? '' : String(value);
    const options = optionsFromChildren(children);

    return (
      <OptionMenu
        id={id}
        required={required}
        tabIndex={typeof tabIndex === 'number' ? tabIndex : undefined}
        title={title}
        aria-invalid={ariaInvalid == null ? undefined : ariaInvalid !== false && ariaInvalid !== 'false'}
        aria-label={ariaLabel}
        value={current}
        options={options}
        disabled={Boolean(disabled)}
        className={typeof className === 'string' ? className : undefined}
        placeholder={options.find((option) => option.value === '')?.label || ''}
        onChange={(next) => {
          history.record(current, next);
          emitChange(onChange, next);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLSelectElement>);
          if (event.defaultPrevented || disabled) return;

          const action = undoKeyAction(event);
          if (action) {
            event.preventDefault();
            event.stopPropagation();
            const next = history.take(action, current);
            if (next === null) return;
            history.restoring.current = true;
            emitChange(onChange, next);
            history.restoring.current = false;
            return;
          }

          if (event.key !== 'Backspace' && event.key !== 'Delete') return;
          event.preventDefault();
          event.stopPropagation();
          if (current === clearValue) return;
          history.record(current, clearValue);
          emitChange(onChange, clearValue);
        }}
      />
    );
}
