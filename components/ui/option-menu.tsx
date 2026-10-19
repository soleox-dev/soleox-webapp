'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsDesktop, useIsTouch } from '@/lib/use-media-query';

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
  /** On touch screens the list starts with a Clear row that calls this. Pass it only while there is something to clear. */
  onClear?: () => void;
};

/** Phone lists are at least this wide, so a list under a narrow filter cell stays readable. */
const PHONE_MIN_MENU_WIDTH = 224;
/** Gap kept between a phone list and the screen edges. */
const PHONE_EDGE = 8;

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
  onClear,
}: OptionMenuProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [narrowing, setNarrowing] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight?: number }>({ top: 0, left: 0, width: 0 });
  const isDesktop = useIsDesktop();
  const isTouch = useIsTouch();
  const isTouchRef = useRef(isTouch);
  isTouchRef.current = isTouch;
  // Tapping a pick-only menu opens the list without raising the keyboard.
  const pickOnly = isTouch && !allowCustom;
  const showClear = isTouch && onClear !== undefined;
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
    const viewport = window.visualViewport;
    if ((isDesktop && !isTouchRef.current) || !viewport) {
      const openUp = rect.bottom + 6 + menuHeight > window.innerHeight && rect.top > menuHeight + 6;
      setBox({
        top: openUp ? rect.top - menuHeight - 6 : rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
      return;
    }
    // Phones and tablets: measure against the visible area (it shrinks under the keyboard
    // and on pinch zoom), keep the list on screen, and cap its height to the room left.
    const viewTop = viewport.offsetTop;
    const viewBottom = viewport.offsetTop + viewport.height;
    const viewLeft = viewport.offsetLeft;
    const viewWidth = viewport.width;
    const below = viewBottom - rect.bottom - 6 - PHONE_EDGE;
    const above = rect.top - viewTop - 6 - PHONE_EDGE;
    const openUp = menuHeight > below && above > below;
    const room = Math.max(openUp ? above : below, 96);
    const height = Math.min(menuHeight, room);
    const width = Math.min(Math.max(rect.width, PHONE_MIN_MENU_WIDTH), viewWidth - PHONE_EDGE * 2);
    const left = Math.min(Math.max(rect.left, viewLeft + PHONE_EDGE), viewLeft + viewWidth - PHONE_EDGE - width);
    setBox({
      top: openUp ? rect.top - height - 6 : rect.bottom + 6,
      left,
      width,
      maxHeight: room,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, visible.length]);

  // A typed value that matches an option's label commits that option's value.
  const commitExactMatch = () => {
    if (!allowCustom) return;
    const exact = options.find((option) => optionText(option).toLowerCase() === value.trim().toLowerCase());
    if (exact && exact.value !== value) onChange(exact.value);
  };

  useEffect(() => {
    if (!open) return;
    // pointerdown covers taps too; touch browsers send mousedown late or not at all.
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      const field = inputRef.current?.closest('label');
      if (inputRef.current?.contains(target) || field?.contains(target) || menuRef.current?.contains(target)) return;
      // On touch the blur handler leaves the list open, so this is where a typed value commits.
      if (isTouchRef.current) commitExactMatch();
      setOpen(false);
      setNarrowing(false);
    };
    const timer = window.setTimeout(() => document.addEventListener('pointerdown', onPointer), 0);
    const viewport = window.visualViewport;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
      document.removeEventListener('pointerdown', onPointer);
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
        readOnly={pickOnly || undefined}
        inputMode={pickOnly ? 'none' : undefined}
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
          // iOS blurs the field when an option is tapped, before the tap's click, and its hover
          // state sticks. Touch closes on an outside pointerdown instead, unless focus moved on.
          if (isTouch && !(next instanceof Node)) return;
          // The option click finishes after this blur. Closing here removes the list
          // before that click, and the click lands on the popup behind it.
          window.setTimeout(() => {
            if (menuRef.current?.contains(document.activeElement)) return;
            if (!isTouch && menuRef.current?.matches(':hover')) return;
            commitExactMatch();
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
      {pickOnly && required && (
        // A read-only field skips form validation, so this stand-in keeps "required" working.
        // Focusing it (the browser does when the form is invalid) moves focus to the real field.
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          inputMode="none"
          value={value}
          onChange={() => {}}
          onFocus={() => inputRef.current?.focus()}
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      )}
      {open && (visible.length > 0 || showClear) && typeof document !== 'undefined' && createPortal(
        <ul
          ref={menuRef}
          id={listId}
          role="listbox"
          data-app-layer=""
          style={{ position: 'fixed', top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight, zIndex: 200 }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white py-1 shadow-lg md:max-h-48 md:overscroll-auto touch:max-h-72 dark:border-slate-600 dark:bg-slate-800"
        >
          {showClear && (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onClear?.();
                  setNarrowing(false);
                  setOpen(false);
                }}
                className="flex min-h-11 w-full cursor-pointer items-center border-b border-slate-100 px-3 text-left text-base font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400"
              >
                Clear
              </button>
            </li>
          )}
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
                className={`flex min-h-11 w-full cursor-pointer items-center px-3 text-left text-base font-medium md:inline-block md:min-h-0 md:px-2.5 md:py-1.5 md:text-xs touch:flex touch:min-h-11 touch:px-3 touch:py-0 touch:text-base disabled:cursor-not-allowed disabled:opacity-40 ${
                  index === activeIndex
                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                    : 'text-slate-900 hover:bg-emerald-500/15 hover:text-emerald-800 dark:text-white dark:hover:text-emerald-200'
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
