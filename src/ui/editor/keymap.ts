/*
 * Central keyboard shortcut definitions. The TipTap extensions
 * register the actual keymap handlers (StarterKit binds Ctrl/Cmd-B
 * etc. out of the box); this file is the source of truth for the
 * strings displayed inside tooltips next to each toolbar button.
 *
 * Keeping the labels here means a future shortcut change can update
 * one constant instead of hunting through every Tooltip.
 */

const isMac =
  typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')

const mod = isMac ? '⌘' : 'Ctrl'
const shift = isMac ? '⇧' : 'Shift'
const alt = isMac ? '⌥' : 'Alt'

export const SHORTCUTS = {
  bold: `${mod} B`,
  italic: `${mod} I`,
  strike: `${mod} ${shift} X`,
  code: `${mod} E`,
  link: `${mod} K`,
  bulletList: `${mod} ${shift} 8`,
  orderedList: `${mod} ${shift} 7`,
  taskList: `${mod} ${shift} 9`,
  blockquote: `${mod} ${shift} B`,
  codeBlock: `${mod} ${alt} C`,
  heading1: `${mod} ${alt} 1`,
  heading2: `${mod} ${alt} 2`,
  heading3: `${mod} ${alt} 3`,
  heading4: `${mod} ${alt} 4`,
  paragraph: `${mod} ${alt} 0`,
  undo: `${mod} Z`,
  redo: `${mod} ${shift} Z`,
  hardBreak: `${shift} ↵`,
  help: `${mod} /`,
} as const
