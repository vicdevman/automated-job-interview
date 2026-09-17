/**
 * `three` ships its own .d.ts in newer versions, but the installed copy here
 * does not resolve under this project's module settings. This is a loose
 * fallback so PixelBlast (which uses `three` directly, deliberately outside
 * the provider-abstraction rule since it's decorative, not a data provider)
 * type-checks. If `@types/three` or a newer `three` ever gets installed, this
 * file becomes a harmless no-op and can be deleted.
 */
declare module 'three';
