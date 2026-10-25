1. **Tempest-1.png (wide shot)**: Take the valley basin under the mountains, the river wrapping the north edge, the straight north–south spine, the off-center arena, and the farmland ring, with the roofs reading as one warm terracotta mass from above. Skip the lens flare and light rays.

2. **Tempest-2.jpg (collage, interiors)**: Take the interiors (council hall, forge, weaving room) for warm indoor light sources, plus the aqueduct, lumber clearing, and terraced cave pools, where the glowing water is the only night-like mood in this batch. Skip the characters.

3. **Tempest-3.jpg (main square)**: Take the teal hip roof with its pediment gables on the white neoclassical hall, the deep tiled eaves of the timber shops framing it, the bollard line, and the wide stone plaza. Skip the rainbow god rays.

4. **Tempest-4.png (eye-level street)**: Take the street width, the two-storey rows, the dark timber against white plaster, the tiled awning eaves, and the hanging red lanterns as the main light source for night scenes. Skip the signage.

5. **Tempest-5.png (wide shot, main boulevard)**: Take the roof contrast across the boulevard (dark heavy-ridged Japanese tile on one side, steep Western gables on the other), the fountain roundabout, and the long view out to the hills. Skip the tiny crowd sprites.

6. **Tempest-6.png (town plan)**: Take the grid around a central square where the two main roads cross, the diagonal cut-through streets, and the zoning: government to the north, commerce and production to the west, open tourism to the southeast, farms and pasture on the edges. Skip the canon place names.

7. **Tempest-7.png (roofs up close)**: Take the roof kit in detail (upswept pagoda eaves with horned ridge ends, green glazed tile, thatch, yurt domes, half-timber gables), the red-and-white paper lanterns on the open stall as night lighting, and the fan-pattern cobbles. Skip the in-world script on the signs.

8. **Tempest-8.png (wide shot, overlook)**: Take the grassy hilltop as a planned vista point and the orange roof field against the green fields and the river. Skip the characters and the watermark.


---

## TOWN PLAN (binding): the owner chose Tempest-6 as the plan of the town

Where anything else in these notes, in the task brief or in `worldgen/tempest/layout.ts` disagrees with this section, THIS SECTION WINS (except that the road gates that the RoadNetwork needs must be kept, see Gates). Read `Tempest-6.png` yourself and measure from it. Names written on the picture come from a TV series and must NOT be used; use the generic names below.

**Frame and scale.** North is up (negative z). The picture is 1580 by 1480 pixels. Take 1 pixel as about 0.33 game blocks (a block of houses plus its street is about 128 px, about 42 blocks). The Central Square sits at pixel (785, 750) and is local (0, 0), the city centre at world (1500, 0). The built grid spans roughly x -185 to +190 and z -180 to +180, about 380 by 360 blocks. Farms, pastures and a forest edge fill the rest of the 700 block footprint, and the zone blends into the wilderness at its outer band.

**Roads.**
- A main east-west avenue (about 11 wide) runs straight through the Central Square; a main north-south avenue of the same width crosses it there. The Central Square is a small circular roundabout (radius about 7) with a fountain; the four blocks around it have clipped (chamfered) corners.
- Every other street is part of a regular grid, 6 wide, blocks about 38 by 34. At the east edge of the grid runs a boundary road lined with lamp posts or bollards and small stalls.
- Diagonal cut-through streets, 5 wide: two parallel diagonals in the north-west quadrant (running from the south-west to the north-east, near the luxury villas), and a fan of four diagonals in the north-east quadrant (running from the north-west to the south-east, among the dense houses); short diagonal corner streets also flank the civic compound.
- Outside the grid the two avenues continue as paved roads through farms and pasture to the zone edge, where the RoadNetwork takes over.

**Gates.** The west end of the east-west avenue is the west gate and road to the Town of Beginnings; the north end of the north-south avenue is the north gate and road toward Fremmevilla. Keep the exact gate positions the RoadNetwork in `worldgen/roads` needs and bend the avenues slightly outside the grid if required. The east and south ends are plain roads that fade out into the wilderness (stubs the RoadNetwork can adopt later), with a modest gatehouse each.

**Zoning (this is the heart of the plan).**
- NORTH: at the head of the north-south avenue stands the civic compound, a walled rectangle (about 45 by 50) facing the avenue, with the Town Hall (white neoclassical hall, teal hip roof, pediment gables) behind a forecourt. West of it: government residences and, further west, a park-like quarter of guest houses on large lots with trees and ponds. East of it: a long strip of large public-building plots (halls, a school, a clinic, barracks), some still scaffolded as under construction.
- NORTH-WEST, middle band: luxury residential villas on large lots with gardens, some lots left as empty gardens.
- WEST half: commercial sector along both sides of the east-west avenue (shop fronts, awnings, stalls), then south of it the production sector (workshops, forge, smithies, a weaving hall, a lumber yard), then the storage sector at the far west (large warehouses and long sheds), then dense residences at the south-west.
- CENTRE-EAST, north of the avenue: dense mixed residences, with the diagonal streets cutting through them.
- SOUTH-EAST: the planned tourism and entertainment sector, a large area laid out as a regular grid of big plots, filled with inns, a bath house, a theatre, a market hall, formal gardens and a park with a pond, deliberately less dense, with a few plots left as construction sites and meadows.
- EAST edge: beyond the boundary road lie farms laid out in curved, radial field patterns, with a small river running down from the north-east corner and a pond further south-east.
- WEST edge: a fenced horse pasture and a second fenced paddock, with a row of small stalls and stables flanking the west gate road.
- All around the town the forest hugs the edge with an irregular outline.
- NORTH beyond the gate: the road runs into the forest to a decorated, sealed cave mouth (a stone portal) set into a rock face. SOUTH-EAST beyond the grid: a small memorial cairn on a hill beside the south road.
- NORTH-EAST, outside the grid: a circular arena (our Coliseum, with training grounds) in a clearing, with a small guard hut.

**Look reminders from the other pictures.** Red and red-and-white lanterns as the night light, warm interiors (council hall, forge, weaving room), optional aqueduct and lumber clearing, terraced glowing cave pools near the north cave, fan-pattern cobbles and bollards in the squares, a mix of dark ridged Japanese tile, terracotta, green glazed tile and thatch roofs.
