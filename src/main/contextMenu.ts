import { BrowserWindow, Menu, session, shell } from 'electron'

type TextTransform = 'uppercase' | 'lowercase' | 'capitalize'

function syncActiveAnnotationText(win: BrowserWindow): void {
  win.webContents
    .executeJavaScript(`
      (() => {
        const el = document.activeElement
        if (!el || el.tagName !== 'TEXTAREA') return null
        const id = el.dataset.annotationId
        if (!id) return null
        return { id, text: el.value }
      })()
    `)
    .then((result: { id: string; text: string } | null) => {
      if (result) win.webContents.send('annotation:text-sync', result)
    })
    .catch(() => {})
}

function transformSelection(win: BrowserWindow, mode: TextTransform): void {
  win.webContents
    .executeJavaScript(`
      (() => {
        const el = document.activeElement
        if (!el || el.tagName !== 'TEXTAREA') return null
        const start = el.selectionStart
        const end = el.selectionEnd
        if (start === end) return null
        const selected = el.value.slice(start, end)
        let transformed = selected
        const mode = ${JSON.stringify(mode)}
        if (mode === 'uppercase') transformed = selected.toUpperCase()
        else if (mode === 'lowercase') transformed = selected.toLowerCase()
        else transformed = selected.replace(/\\b\\w/g, (c) => c.toUpperCase())
        el.value = el.value.slice(0, start) + transformed + el.value.slice(end)
        el.selectionStart = start
        el.selectionEnd = start + transformed.length
        el.dispatchEvent(new Event('input', { bubbles: true }))
        const id = el.dataset.annotationId
        return id ? { id, text: el.value } : null
      })()
    `)
    .then((result: { id: string; text: string } | null) => {
      if (result) win.webContents.send('annotation:text-sync', result)
    })
    .catch(() => {})
}

function appendSpellingItems(
  template: Electron.MenuItemConstructorOptions[],
  win: BrowserWindow,
  params: Electron.ContextMenuParams,
): void {
  if (!params.misspelledWord) return

  const suggestions = params.dictionarySuggestions ?? []
  if (suggestions.length > 0) {
    for (const suggestion of suggestions) {
      template.push({
        label: suggestion,
        click: () => {
          win.webContents.replaceMisspelling(suggestion)
          setImmediate(() => syncActiveAnnotationText(win))
        },
      })
    }
  } else {
    template.push({ label: 'No suggestions', enabled: false })
  }

  template.push({ type: 'separator' })
  template.push({
    label: 'Learn Spelling',
    click: () => {
      session.defaultSession.addWordToSpellCheckerDictionary(params.misspelledWord!)
    },
  })
  template.push({ type: 'separator' })
}

function appendLookupItems(
  template: Electron.MenuItemConstructorOptions[],
  win: BrowserWindow,
  params: Electron.ContextMenuParams,
): void {
  const lookupText = params.selectionText || params.misspelledWord
  if (!lookupText) return

  const truncated =
    lookupText.length > 24 ? `${lookupText.slice(0, 24)}…` : lookupText

  template.push({
    label: `Look Up “${truncated}”`,
    click: () => win.webContents.showDefinitionForSelection(),
  })
  template.push({
    label: 'Search with Google',
    click: () => {
      void shell.openExternal(
        `https://www.google.com/search?q=${encodeURIComponent(lookupText)}`,
      )
    },
  })
  template.push({ type: 'separator' })
}

function appendMacTextItems(
  template: Electron.MenuItemConstructorOptions[],
  win: BrowserWindow,
  params: Electron.ContextMenuParams,
): void {
  template.push(
    { role: 'toggleSpellChecker' },
    { role: 'showSubstitutions' },
    {
      label: 'Transformations',
      submenu: [
        {
          label: 'Make Uppercase',
          enabled: params.editFlags.canCut,
          click: () => transformSelection(win, 'uppercase'),
        },
        {
          label: 'Make Lowercase',
          enabled: params.editFlags.canCut,
          click: () => transformSelection(win, 'lowercase'),
        },
        {
          label: 'Capitalize',
          enabled: params.editFlags.canCut,
          click: () => transformSelection(win, 'capitalize'),
        },
      ],
    },
    { role: 'startSpeaking' },
    { type: 'separator' },
    { role: 'services' },
  )
}

export function setupWebContextMenu(win: BrowserWindow, isDev: boolean): void {
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return

    const template: Electron.MenuItemConstructorOptions[] = []

    appendSpellingItems(template, win, params)
    appendLookupItems(template, win, params)

    template.push(
      { role: 'undo', enabled: params.editFlags.canUndo },
      { role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'pasteAndMatchStyle', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    )

    if (process.platform === 'darwin') {
      template.push({ type: 'separator' })
      appendMacTextItems(template, win, params)
    }

    if (isDev) {
      template.push(
        { type: 'separator' },
        {
          label: 'Inspect Element',
          click: () => win.webContents.inspectElement(params.x, params.y),
        },
      )
    }

    const frame = params.frame ?? win.webContents.focusedFrame
    Menu.buildFromTemplate(template).popup({
      window: win,
      x: params.x,
      y: params.y,
      frame: frame ?? undefined,
    })
  })
}
