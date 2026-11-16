/**
 * Unsplash photos for marketing pages (free under the Unsplash License).
 * Never used to depict a campaign's patient.
 */
export const photos = {
  motherAndChild: {
    id: "1735792339621-2846f164b78f",
    alt: "A mother in a yellow top smiles at her young son as they sit together.",
  },
  surgeon: {
    id: "1769072610024-5b8a50f05c73",
    alt: "A surgeon in blue scrubs stands with arms folded under operating-room lights.",
  },
  doctor: {
    id: "1678695972687-033fa0bdbac9",
    alt: "A smiling young doctor in a white coat with a stethoscope.",
  },
};

export const unsplashUrl = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=75`;
