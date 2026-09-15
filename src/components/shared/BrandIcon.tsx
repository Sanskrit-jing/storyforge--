/** The author-supplied StoryForge mark, shared by every product shell. */
export default function BrandIcon({ size = 38 }: { size?: number }) {
  return <img data-storyforge-brand src={`${import.meta.env.BASE_URL}brand/storyforge-icon.png`} alt="" aria-hidden="true" width={size} height={size} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
}
