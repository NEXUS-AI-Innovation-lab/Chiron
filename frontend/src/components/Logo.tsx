/**
 * Logo Chiron : le centaure porte-étendard.
 *
 * Deux fichiers, et non un seul retourné par filtre CSS : le dessin n'est pas
 * monochrome. Sur fond sombre le corps est blanc avec les aplats verts ; sur
 * fond clair il est entièrement vert. Un `filter: invert()` produirait du
 * magenta sur le vert.
 *
 * Le choix ne dépend PAS du thème mais du FOND sur lequel le logo est posé.
 * La distinction compte : la barre de navigation reste sombre dans les deux
 * thèmes, elle demande donc toujours la variante claire du dessin, alors que
 * l'écran de connexion suit le thème.
 */

import surFondSombre from "../assets/chiron-logo-sombre.png";
import surFondClair from "../assets/chiron-logo-clair.png";

interface LogoProps {
  /** Couleur du fond sur lequel le logo est posé. */
  fond: "sombre" | "clair";
  /** Hauteur en pixels. La largeur suit le rapport du dessin. */
  hauteur?: number;
  className?: string;
}

export default function Logo({ fond, hauteur = 32, className }: LogoProps) {
  const source = fond === "sombre" ? surFondSombre : surFondClair;

  return (
    <img
      src={source}
      alt=""
      aria-hidden="true"
      height={hauteur}
      style={{ height: hauteur, width: "auto" }}
      className={className}
      // Le logo est décoratif : le nom « Chiron » est écrit juste à côté, en
      // texte. Le doubler dans un `alt` ferait répéter la marque aux lecteurs
      // d'écran.
      draggable={false}
    />
  );
}
