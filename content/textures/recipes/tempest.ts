import { TextureRecipe } from '../TextureRecipe';
import { tempestLightRecipes } from './tempestLight';
import { tempestMasonryRecipes } from './tempestMasonry';
import { tempestPropRecipes } from './tempestProps';
import { tempestStoneRecipes } from './tempestStone';
import { tempestWoodRecipes } from './tempestWood';

/** Every tile of the Tempest set, in the order they are registered (and shown on the contact sheet). */
export const tempestRecipes = (): TextureRecipe[] => [
  ...tempestWoodRecipes(),
  ...tempestMasonryRecipes(),
  ...tempestStoneRecipes(),
  ...tempestLightRecipes(),
  ...tempestPropRecipes(),
];
