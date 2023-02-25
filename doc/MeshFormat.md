# Lilac Mesh Format

A Lilac mesh is a two-dimensional triangle mesh that is intended to add three-dimensional normal data to an existing two-dimensional image.

Lilac meshes are stored in [\[JSON\]][json] text files with a specific JSON structure.

## 1. Top-level structure

The top-level entity in a Lilac mesh file must be a JSON object that has at least the following two properties:

* `points` &mdash; an array of zero or more point objects
* `tris` &mdash; an array of zero or more triangle arrays

A _point object_ is a JSON object that has at least the following three properties:

* `uid` &mdash; encoded unique ID string
* `nrm` &mdash; encoded normal direction string
* `loc` &mdash; encoded location of point string

The specific format of these encoded fields is described in &sect;2 Encoded fields.

A _triangle array_ is a JSON array of exactly three strings.  Each string must have a decoded numeric value that matches the decoded numeric value of a point `uid` in the `points` array.

There are additional restrictions on how arrays must be sorted and on uniqueness requirements, which is described in &sect;3 Verification.

Any additional properties of the top-level entity or the point object that are not defined in this specification should be ignored by parsers.

## 2. Encoded fields

The `uid` field of the point object and the string elements of triangle arrays share the same encoded format.  In both cases, the field must be a string of one to eight base-16 digits.  Both uppercase `A-F` and lowercase `a-f` letters may be used as base-16 digits, in additional to the decimal digits `0-9`.  The first digit may not be zero, and the decoded numeric value of the `uid` field must be in range \[1, 1073741823\].

The `nrm` and `loc` fields of the point object share the same encoded format.  In both cases, the field must have the following format:

1. A sequence of one to five decimal digits
2. A comma `,`
3. A sequence of one to five decimal digits

The decimal digit sequences may not start with a zero digit unless they have a length of exactly one.  Furthermore, the decoded numeric value of each decimal digit sequence must be in range \[0, 16384\].  Finally, the `nrm` field has two additional restrictions.  In the `nrm` field, the second integer value must be in range \[0, 16383\].  Also, in the `nrm` field, if the first integer value is zero, then the second integer value must be zero also.

In both the `nrm` and `loc` fields, the encoded string should be decoded into two normalized floating-point values in range \[0.0, 1.0\].  The integer values encoded in the field are converted to normalized floating-point values by converting the integer value to floating point and dividing by 16384.0.

For the `nrm` field, the first floating-point value is the direction away from the viewer.  Supposing that the viewer is facing directly down the ascending Z axis in a left-handed 3D coordinate system, a value of 0.0 in the first floating-point value means that the normal is (0, 0, -1), which means the normal is facing directly down the _descending_ Z axis.  A value of 1.0 in the first floating-point value means that the normal direction lies entirely within the XY plane in the form (_x_, _y_, 0).

Note that the encoded normal direction is __not__ transformed by the perspective transform.  Therefore, if a point has a non-zero X and/or Y coordinate, and the point also has an encoded value of 0.0 in the first floating-point value of the `nrm` field, the normal is __not__ directly facing the viewer after a perspective transform is applied.

If the second floating-point value in the `nrm` field is multipled by 2&middot;&pi;, then it encodes the angle in radians of the normal direction when projected into the XY plane.  An encoded value of 0.0 in the second floating-point value means that the normal has an angle of zero radians and is therefore pointing towards the ascending X axis when the normal is projected into the XY plane.  An encoded value of 0.25 in the second floating-point value means that the normal has an angle of &pi;/2 radians and is therefore pointing towards the ascending Y axis when the normal is projected into the XY plane.  An encoded value of 0.5 in the second floating-point value means that the normal has an angle of &pi; radians and is therefore pointing towards the descending X axis when the normal is projected into the XY plane.  And so forth.

The additional restrictions on the encoded `nrm` field noted earlier in this section require the second floating-point value to be less than 1.0.  This is because 1.0 would be a value of 2&middot;&pi; radians, which is the same angle as zero radians.  The additional restrictions also require that if the first floating-point value is zero, then the second floating-point value must be zero as well.  If the first floating-point value is zero, it means the normal vector is (0, 0) when projected into the XY plane, so it does not have any angle.  This is why the angle field is zeroed out in this specific case.

For the `loc` field, the first floating-point value is the normalized X coordinate in the tracing image, and the second floating-point value is the normalized Y coordinate in the tracing image.  __However,__ the normalized coordinates are oriented such that (0, 0) is in the __bottom-left__ corner of the image, rather than the top-left.

To convert these normalized coordinates to image pixel coordinates, you must first invert the Y coordinate so that it matches the top-left orientation of the image.  Do this by subtracting the Y coordinate from 1.0.  Then, multiply the normalized X coordinate by one less than the width in pixels of the tracing image, and multiply the normalized Y coordinate by one less than the height in pixels of the tracing image.  Finally, take the `floor()` of both multiplied values to get the actual integer pixel coordinates.

Note that the normalized X coordinates and normalized Y coordinates do not necessarily have the same scale.  They are dependent on the aspect ratio of the tracing image.

## 3. Verification

Lilac meshes have additional restrictions beyond those imposed in the preceding sections.  These restrictions are described in the following subsections.

### 3.1 Orphan point restriction

Each point in the `points` array must be referenced from at least one triangle.  Points that are not referenced from any triangles are _orphan_ points, and they are not allowed within mesh files.

### 3.2 Unique ID restriction

Each point in the `points` array must have a unique `uid` value that no other point has.  The `uid` field therefore uniquely identifies a particular point in the array.

### 3.3 Point sorting

Points must be sorted in ascending numeric order of their `uid` value.  The numeric value is the value after the `uid` field has been decoded to an integer.  Therefore, the field is sorted as an integer rather than as a string.

### 3.4 Vertex distinction restriction

Each triangle array must consist of three distinct vertex `uid` references.  No point may be used more than once in the same triangle.  As per the definition given in &sect;1, each `uid` reference within a triangle array must reference a point within the `points` array.

### 3.5 Vertex sorting restriction

Within a triangle array, the first vertex must always be the vertex with the lowest numeric `uid` reference value.  The remaining two vertex indices must be sorted such that the vertices are in counter-clockwise order around the triangle; in other words, when traveling around the vertices in the order given in the array, the interior of the triangle is always on the left side.  No triangle may have all three vertices be colinear.

To determine whether the vertex sorting restriction is satisfied for a particular triangle array \[P1, P2, P3\], first check that P1 has the lowest numerical `uid` value.  Then, compute the three-dimensional cross product (P2-P1)&times;(P3-P1).  (Since the Z coordinate of all three vertices is always zero, the normal computation can be simplified to only the Z-axis vector of the normal, since the X and Y vectors of the normal will always end up zero.)  The Z-axis vector of the normal must have a magnitude greater than zero for the vertex sorting restriction to be satisfied.

### 3.6 Half-edge restriction

Within a triangle array \[P1, P2, P3\], the triangle has three edges:

1. P1 to P2
2. P2 to P3
3. P3 to P1

The _ordered_ points of each edge must be unique and not used within any other triangle in the mesh.  Note that for the purposes of this restriction, the edge from a point Pa to another point Pb is __not__ the same as an edge from Pb to Pa.  This allows each edge to be shared by up to two triangles, provided that the two triangles have the edge moving in opposite directions.

### 3.7 Triangle sorting restriction

Triangles must be sorted by the numeric `uid` values of the first two points in their vertex array.  Sorting is first in ascending order of the first point's `uid` value and second in ascending order of the second point's `uid` value.  Because of the half-edge restriction (&sect;3.6), no two triangles may have the same `uid` values for their first two points, so the order given in this subsection is complete without examining the third point.

## External references

[\[JSON\]][json] &mdash; "Introducing JSON"\
`www.json.org`

[json]: https://www.json.org/
