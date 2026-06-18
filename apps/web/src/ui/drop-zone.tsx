// Drag-drop ingest surface (plan §2.4), built from Cascivo's `cn` primitive and
// CSS Modules. Purely presentational and signal-driven: it renders whatever the
// IngestController's phase signal says and forwards drag/drop intents back. No
// React hooks; all copy via @cascivo/i18n.
import { cn } from '@cascivo/core';
import { t } from '@cascivo/i18n';
import type { Phase } from '../ingest-controller.js';
import { messages } from '../messages.js';
import styles from './drop-zone.module.css';

export interface DropZoneProps {
  phase: Phase;
  onDragValidity: (valid: boolean) => void;
  onLeave: () => void;
  onFiles: (files: readonly File[]) => void;
}

function label(phase: Phase): string {
  switch (phase.kind) {
    case 'drag':
      return phase.valid ? t(messages.dropValid) : t(messages.dropInvalid);
    case 'chunking':
      return `${t(messages.chunking)} ${phase.done}/${phase.total}`;
    case 'success':
      return t(messages.success);
    case 'error':
      return `${t(messages.errorGeneric)}: ${phase.message}`;
    default:
      return t(messages.dropPrompt);
  }
}

export function DropZone({ phase, onDragValidity, onLeave, onFiles }: DropZoneProps) {
  const dragging = phase.kind === 'drag';
  return (
    <section
      class={cn(
        styles.zone,
        dragging && phase.valid && styles.valid,
        dragging && !phase.valid && styles.invalid,
        phase.kind === 'error' && styles.error,
      )}
      aria-label={t(messages.dropPrompt)}
      aria-busy={phase.kind === 'chunking'}
      onDragOver={(event) => {
        event.preventDefault();
        onDragValidity((event.dataTransfer?.types ?? []).includes('Files'));
      }}
      onDragLeave={onLeave}
      onDrop={(event) => {
        event.preventDefault();
        onFiles(Array.from(event.dataTransfer?.files ?? []));
      }}
    >
      {label(phase)}
    </section>
  );
}
