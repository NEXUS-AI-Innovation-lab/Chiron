/**
 * Icônes de la maquette Figma (fichiers SVG de src/assets/auth/, inchangés).
 *
 * Elles sont dessinées en couleur fixe. Pour qu'elles suivent le thème, on les
 * affiche en masque CSS (classe .wg-icon) : la forme vient du fichier, la
 * couleur du `color` courant, donc d'un jeton.
 */

import type { CSSProperties } from "react";

import arrowLeft from "../../../assets/auth/arrow-left.svg";
import arrowRight from "../../../assets/auth/arrow-right.svg";
import checkCase from "../../../assets/auth/check-case.svg";
import checkPastille from "../../../assets/auth/check-pastille.svg";
import envelope from "../../../assets/auth/envelope.svg";
import eye from "../../../assets/auth/eye.svg";
import eyeSlash from "../../../assets/auth/eye-slash.svg";
import firstAid from "../../../assets/auth/first-aid.svg";
import info from "../../../assets/auth/info.svg";
import lockSimple from "../../../assets/auth/lock-simple.svg";
import microscope from "../../../assets/auth/microscope.svg";
import user from "../../../assets/auth/user.svg";
import warning from "../../../assets/auth/warning.svg";

const ICONS = {
  "arrow-left": arrowLeft,
  "arrow-right": arrowRight,
  "check-case": checkCase,
  "check-pastille": checkPastille,
  envelope,
  eye,
  "eye-slash": eyeSlash,
  "first-aid": firstAid,
  info,
  "lock-simple": lockSimple,
  microscope,
  user,
  warning,
} as const;

export type AuthIconName = keyof typeof ICONS;

interface AuthIconProps {
  name: AuthIconName;
  /** Côté en pixels (celui de la maquette pour chaque emplacement). */
  size: number;
  className?: string;
}

export function AuthIcon({ name, size, className = "" }: AuthIconProps) {
  const style = {
    width: size,
    height: size,
    "--wg-icon-src": `url("${ICONS[name]}")`,
  } as CSSProperties;
  return <span aria-hidden="true" className={`wg-icon ${className}`} style={style} />;
}
