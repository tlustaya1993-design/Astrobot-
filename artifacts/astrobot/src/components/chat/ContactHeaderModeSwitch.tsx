import React from 'react';
import ContactAnalysisModeSegment from '@/components/chat/ContactAnalysisModeSegment';

interface Props {
  extended: boolean;
  onChange: (extended: boolean) => void;
  disabled?: boolean;
}

/** Компактный переключатель в шапке чата — тот же state, что и экран выбора режима. */
export default function ContactHeaderModeSwitch({ extended, onChange, disabled }: Props) {
  return (
    <div className="shrink-0 pl-1">
      <ContactAnalysisModeSegment
        extended={extended}
        onChange={onChange}
        disabled={disabled}
        size="compact"
      />
    </div>
  );
}
