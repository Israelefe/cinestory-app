// Shared by generation, API validation and the creation editor.
export const DETAILED_WRITING_FORMATS = Object.freeze(['chapters', 'editorial', 'event-coverage', 'campaign']);
export const DELIVERY_WRITING_VERSION = 'format-context-v1';
export const hasDetailedWriting = format => DETAILED_WRITING_FORMATS.includes(format);
export const photoCaptionLimit = format => format === 'photo-story' ? 150 : hasDetailedWriting(format) ? 320 : 180;
