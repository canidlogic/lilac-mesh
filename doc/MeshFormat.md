# Lilac Mesh Format

A Lilac mesh is a two-dimensional triangle mesh that is intended to add three-dimensional normal data to an existing two-dimensional image.

Lilac meshes are stored in [Shastina](http://www.purl.org/canidtech/r/shastina) text files.  The specific dialect of Shastina used for Lilac mesh files is described in this document.

## 1. Header

Lilac mesh files begin with a Shastina metacommand identifying the Shastina file as a Lilac mesh, followed by a metacommand that counts how many points and triangles are defined in the mesh:

    %lilac-mesh;
    %dim 18 6;

The example above declares that there are 18 points and 6 triangles defined in the mesh file.

## 2. Interpreter

The Shastina interpreter stack for Lilac mesh files only contains integers in range [0, 16384].

Following the header, only the following types of Shastina entities are supported in Lilac mesh files:

1. `SNENTITY_EOF`
2. `SNENTITY_NUMERIC`
3. `SNENTITY_OPERATION`

The only operations supported are `p` which declares a point and `t` which declares a triangle.  There total number of point operations and the total number of triangle operations in the Shastina file must exactly match the dimensions given in the header of the Shastina file.  The order in which points are defined is significant, and the order in which triangles are defined is significant.  Point and triangle definitions may be mixed in any way __except__ for the restriction that triangles may only be defined after all their component points have been defined.

Numeric entity operations only support unsigned decimal integers.  The parsed numeric value must be in range [0, 16384].  The numeric entity operation pushes the integer value onto the interpreter stack.  The `p` and `t` operations consume integers from the stack, as described in the following sections.  At the end of interpretation, the interpreter stack must be empty once again.

## 3. Point operation

A point operation has the following syntax:

    [normd] [norma] [x] [y] p

All of the bracketed parameters are numeric entities that push values onto the interpreter stack.  The point operation consumes all of these parameters and does not push anything onto the stack.

The `normd` parameter is the normal direction away from viewer.  A value of zero means that the normal at this point is directly facing the viewer.  A value of 16384 means that the normal is at a 90-degree angle away from the viewer.  Any value between those two extremes is also allowed.

The `norma` parameter is the normal direction angle.  This angle applies to the normal when it is projected into the XY plane, where the X axis moves to the right and the Y axis moves __upward__.

If the `normd` field is zero, then the `norma` field must be zero, too.  This is because when the normal is pointing directly at the viewer, it becomes a zero-magnitude vector when projected into the XY plane, and therefore doesn't have any angle.

A value of zero for `norma` means an angle of zero radians, which points directly along the X axis.

A `norma` value of (16384 &div; 4) means an angle of &pi;/2 radians, which points directly along the (upward!) Y axis.
 
A `norma` value of (16384 &div; 2) means an angle of &pi; radians, which points down the negative X axis.

The maximum value of `norma` is 16383, which is __one less__ than 16384.  This is because 16384 would be an equivalent angle to zero radians.

The `x` and `y` parameters are normalized relative to a tracing image, so that (0, 0) is the bottom-left corner of the tracing image and (16384, 16384) is the top-right corner of the tracing image.  Note that this is a __bottom-up__ orientation of scanlines, which is the opposite of the usual top-down orientation of raster image files!

The order in which points are defined in the Shastina file is significant because it determines the index value that is used to reference them from triangle operations.  The first defined point has index zero, the second defined point has index one, and so forth.

Each point that is defined must eventually be referenced from at least one triangle.  Otherwise, it is an "orphan" point that is not allowed within a mesh file.

## 4. Triangle operation

A triangle operation has the following syntax:

    [v1] [v2] [v3] t

All of the bracketed parameters are numeric entities that push values onto the interpreter stack.  The triangle operation consumes all of these parameters and does not push anything onto the stack.

The three parameters to this operation define the three vertices of the triangle.  Each parameter must be a value that is greater than or equal to zero and that refers to the index of a point that has already been defined by a point operation.  Moreover, no two vertices of a triangle may have the same point index.

The vertices of a triangle must be ordered in a specific way.  The first vertex must always be the vertex that has the lowest numeric index value.  The second and third vertices must be ordered such that to move from vertex one to vertex two to vertex three and back again to vertex one is to move in a counter-clockwise direction around the triangle, with the interior of the triangle always on the left.  No triangle may have co-linear vertices, where all vertices fall on a single line or a single point.

To check whether three triangle points \[P1, P2, P3\] are in counter-clockwise orientation, compute the three-dimensional cross product (P2-P1)&times;(P3-P1).  (Since the Z coordinate of all three vertices is always zero, the normal computation can be simplified to only the Z-axis vector of the normal, since the X and Y vectors of the normal will always end up zero.)  The Z-axis vector of the normal must have a magnitude greater than zero for the points to be in counter-clockwise orientation.

The _directed_ edges of each triangle must be unique.  That is, if one triangle has an edge that goes from P1 to P2, then no other triangle may have an edge that goes from P1 to P2.  However, it __is__ acceptable for another triangle to have an edge that goes from P2 to P1.

Finally, triangles must be sorted first in ascending order by the numeric value of their first vertex index and second in ascending order by the numeric value of their second vertex index.  (Since no two triangles are allowed to have the same directed edge, no two triangles may have the same first two vertex values.)

## 5. Limits

Shastina mesh interpreters must support at least 1024 triangles per mesh and at least 3072 points per mesh.  Implementations are allowed to have higher limits, but using more than those limits may cause meshes not to load in certain implementations.
