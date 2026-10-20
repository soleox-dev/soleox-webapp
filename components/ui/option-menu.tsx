'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type MenuOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type OptionMenuProps = {
  value: string;
  options: MenuOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Typing commits the text, the way the Section field does. */
  allowCustom?: boolean;
  className?: string;
  id?: string;
  required?: boolean;
  tabIndex?: number;
  title?: string;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
};

function optionText(option: MenuOption): string {
  return option.label || option.value;
}

export function OptionMenu({
  value,
  options,
  onChange,
  placeholder = '',
  disabled = false,
  allowCustom = false,
  className = '',
  id,
  required,
  tabIndex,
  title,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  onKeyDown,
}: OptionMenuProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [narrowing, setNarrowing] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [box, setBox] = useState({ top: 0, left: 0, width: 0 });
  const selected = options.find((option) => option.value === value);
  const closedText = allowCustom ? value : (selected ? optionText(selected) : '');
  const shown = open && narrowing ? query : closedText;
  const needle = (open && narrowing ? query : closedText).trim().toLowerCase();
  const visible = (open && narrowing
    ? options.filter((option) => optionText(option).toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle))
    : options
  ).filter((option) => option.value !== '' || optionText(option) !== '');

  const place = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 192;
    const openUp = rect.bottom + 6 + menuHeight > window.innerHeight && rect.top > menuHeight + 6;
    setBox({
      top: openUp ? rect.top - menuHeight - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, visible.length]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      const field = inputRef.current?.closest('label');
      if (inputRef.current?.contains(target) || field?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setNarrowing(false);
    };
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onPointer), 0);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const choose = (option: MenuOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setNarrowing(false);
    setOpen(false);
  };

  const showChevron = !className.includes('overview-field-select');

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        title={title}
        required={required}
        disabled={disabled}
        tabIndex={tabIndex}
        placeholder={placeholder}
        value={shown}
        className={`${className}${showChevron ? ' dropdown-chevron' : ''}`}
        onChange={(event) => {
          const next = event.target.value;
          if (allowCustom) onChange(next);
          setQuery(next);
          setNarrowing(true);
          setActiveIndex(0);
          setOpen(true);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => {
          if (disabled) return;
          setNarrowing(false);
          setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          setNarrowing(false);
          const current = visible.findIndex((option) => option.value === value);
          setActiveIndex(Math.max(0, current));
          setOpen(true);
        }}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && menuRef.current?.contains(next)) return;
          // The option click finishes after this blur. Closing here removes the list
          // before that click, and the click lands on the popup behind it.
          window.setTimeout(() => {
            if (menuRef.current?.contains(document.activeElement)) return;
            if (menuRef.current?.matches(':hover')) return;
            if (allowCustom) {
              const exact = options.find((option) => optionText(option).toLowerCase() === value.trim().toLowerCase());
              if (exact && exact.value !== value) onChange(exact.value);
            }
            setNarrowing(false);
            setOpen(false);
          }, 0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index + 1, Math.max(visible.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && open && visible[activeIndex] && !visible[activeIndex].disabled) {
            event.preventDefault();
            choose(visible[activeIndex]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            setNarrowing(false);
          } else if (open && (event.key === 'Backspace' || event.key === 'Delete')) {
            return;
          } else if (!open && (event.key === 'Backspace' || event.key === 'Delete') && !allowCustom) {
            onKeyDown?.(event);
            return;
          }
          if (!event.defaultPrevented) onKeyDown?.(event);
        }}
      />
      {open && visible.length > 0 && typeof document !== 'undefined' && createPortal(
        <ul
          ref={menuRef}
          id={listId}
          role="listbox"
          data-app-layer=""
          style={{ position: 'fixed', top: box.top, left: box.left, width: box.width, zIndex: 200 }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
        >
          {visible.map((option, index) => (
            <li key={`${option.value}-${option.label}`} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}>
              <button
                type="button"
                tabIndex={-1}
                disabled={option.disabled}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  choose(option);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`w-full cursor-pointer px-2.5 py-1.5 text-left text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                  index === activeIndex
                    ? 'bg-brand-500/15 text-brand-800 dark:text-brand-200'
                    : 'text-slate-900 hover:bg-brand-500/15 hover:text-brand-800 dark:text-white dark:hover:text-brand-200'
                }`}
              >
                {optionText(option)}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
