import { defineMessages } from '@cascivo/i18n';

/** Navbar chrome that must stay stable across reading modes — above all the
 *  reading-mode toggle's own labels, which the user needs to read in order to
 *  switch back. Never routed through `pick`; the navbar reads it directly. */
export const nav = defineMessages('safu.nav', {
  modeLabel: 'Reading mode',
  modeRegular: 'Regular',
  modeEli5: 'ELI5',
  modeMachine: 'Machine',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  menu: 'Menu',
});
