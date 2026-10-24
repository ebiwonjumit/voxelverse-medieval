import { Rect, shapeBounds } from '../layout';
import { layoutLandmark } from './LandmarkSpec';

/** The footprint of a layout landmark as a rectangle of world cells (a circle's bounding box). */
export const footprintOf = (id: string): Rect => shapeBounds(layoutLandmark(id).shape);
