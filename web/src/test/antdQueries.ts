import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

// Consultas por texto y no con `*ByRole`: con tablas, modales y popconfirms de antd montados, cada
// consulta por rol tarda cientos de ms en jsdom (ver `UsersPage.test.tsx`).

/** Fila de una tabla que contiene ese texto. */
export function rowOf(text: string): HTMLElement {
  const row = screen
    .queryAllByText(text)
    .map((el) => el.closest('tr'))
    .find((tr) => tr !== null);
  if (!row) throw new Error(`No hay una fila para "${text}"`);
  return row;
}

export function queryRowOf(text: string): HTMLElement | null {
  try {
    return rowOf(text);
  } catch {
    return null;
  }
}

export async function findRow(text: string): Promise<HTMLElement> {
  return waitFor(() => rowOf(text));
}

export function queryButtonIn(container: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    within(container)
      .queryAllByText(label)
      .map((el) => el.closest('button'))
      .find((button) => button !== null) ?? null
  );
}

/** Botón con ese texto dentro de `container`. */
export function buttonIn(container: HTMLElement, label: string): HTMLButtonElement {
  const button = queryButtonIn(container, label);
  if (!button) throw new Error(`No hay un botón "${label}"`);
  return button;
}

export function queryDialog(title: string): HTMLElement | null {
  const titleEl = screen.queryByText(title, { selector: '.ant-modal-title' });
  return titleEl?.closest<HTMLElement>('[role="dialog"]') ?? null;
}

/** El modal con ese título. */
export async function findDialog(title: string): Promise<HTMLElement> {
  return waitFor(() => {
    const dialog = queryDialog(title);
    if (!dialog) throw new Error(`No hay un modal "${title}"`);
    return dialog;
  });
}

/** Opciones visibles del desplegable abierto de un `Select` de antd. */
export function visibleOptions(): string[] {
  return Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'))
    .map((el) => el.textContent);
}

/** Elige una opción del desplegable abierto. */
export async function chooseOption(user: UserEvent, text: string): Promise<void> {
  const option = await waitFor(() => {
    const found = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option',
      ),
    ).find((el) => el.textContent === text);
    if (!found) throw new Error(`No hay una opción "${text}"`);
    return found;
  });
  await user.click(option);
}

/** Confirma el popconfirm abierto. */
export async function confirmPopconfirm(user: UserEvent): Promise<void> {
  await user.click(await waitFor(() => buttonIn(document.body, 'Confirmar')));
}
