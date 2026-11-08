/**
 * Champ de saisie des écrans d'authentification (maquette : 50 px de haut,
 * coins de 12 px, icône à gauche, bordure verte épaisse au focus).
 */

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

import { AuthIcon, type AuthIconName } from "./AuthIcon";

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  label: string;
  icon: AuthIconName;
  /** Message sous le champ (aide ou erreur). */
  hint?: ReactNode;
  invalid?: boolean;
  /** Ajoute le bouton œil qui affiche ou masque le mot de passe. */
  revealable?: boolean;
}

export function AuthField({ label, icon, hint, invalid, revealable, type, ...input }: AuthFieldProps) {
  const id = useId();
  const hintId = `${id}-aide`;
  const [visible, setVisible] = useState(false);
  const effectiveType = revealable ? (visible ? "text" : "password") : type;

  return (
    <div>
      <label className="wg-auth-label" htmlFor={id}>
        {label}
      </label>
      <div className="wg-auth-field" data-invalid={invalid ? "true" : undefined}>
        <AuthIcon name={icon} size={18} />
        <input
          id={id}
          type={effectiveType}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
          {...input}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="flex text-muted hover:text-ink"
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={visible}
          >
            <AuthIcon name={visible ? "eye-slash" : "eye"} size={18} />
          </button>
        )}
      </div>
      {hint && (
        <p id={hintId} className={`mt-1.5 text-xs ${invalid ? "text-danger-text" : "text-faint"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

interface AuthSelectProps {
  label: string;
  icon: AuthIconName;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

/** Liste déroulante au même gabarit que AuthField. */
export function AuthSelect({ label, icon, value, options, onChange }: AuthSelectProps) {
  const id = useId();
  return (
    <div>
      <label className="wg-auth-label" htmlFor={id}>
        {label}
      </label>
      <div className="wg-auth-field">
        <AuthIcon name={icon} size={18} />
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

interface AuthCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

/** Case à cocher de la maquette : carré vert de 20 px, coche foncée. */
export function AuthCheckbox({ checked, onChange, children }: AuthCheckboxProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`flex size-5 items-center justify-center rounded-md border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
          checked ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface"
        }`}
      >
        {checked && <AuthIcon name="check-case" size={13} />}
      </span>
      {children}
    </label>
  );
}
