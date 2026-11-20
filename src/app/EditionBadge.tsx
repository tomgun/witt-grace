// The supporter edition's name beside the logo (S-15, 2026-11-20): shown only in a supporter package.
import { embedded } from '../lib/embedded.ts';
import type { Edition } from '../lib/embedded.ts';
import type { MessageKey } from '../lib/i18n/catalog.ts';
import { useTranslator } from './store.ts';

const LABEL: Record<Edition, MessageKey> = {
  thinker: 'editionThinker',
  thoughtful: 'editionThoughtful',
  professional: 'editionProfessional',
  community: 'editionCommunity',
  organisation: 'editionOrganisation',
};

export function EditionBadge() {
  const t = useTranslator();
  const { edition } = embedded();
  if (!edition) return null;
  return (
    <span
      className="edition-badge"
      data-edition={edition}
      data-testid="edition-badge"
      title={t('editionTitle')}
    >
      <span aria-hidden="true">♥ </span>
      {t(LABEL[edition])}
    </span>
  );
}
