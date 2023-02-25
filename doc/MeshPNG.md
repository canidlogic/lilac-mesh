# Lilac Mesh PNG Format

The `lilacme2png` utility program is able to compile the standard Lilac mesh format into PNG image file that contain interpolated mesh data encoded into colors.  This specification describes the exact interpretation of the colors in the compiled PNG images.

## Image dimensions

The PNG raster image dimensions are selected when using the `lilacme2png` utility.  The normalized, bottom-up coordinates in the mesh file are transformed into the coordinate space of the top-down PNG image such that the normalized coordinate (0, 16384) maps to (0, 0) in the PNG image, and the normalized coordinate (16384, 0) maps to (`w-1`, `h-1`) in the PNG image, where `w` is the width of the PNG image in pixels and `h` is the height of the PNG image in pixels.

## Compiled modes

The `lilacme2png` utility program can compile images in two modes:  scalar and vector.  In scalar mode, each pixel of the compiled PNG image stores a single parameter value in range [-1.0, 1.0], and there is also a special pixel value indicating that the pixel is not covered by the mesh.

In vector mode, each pixel of the compiled PNG image stores a three-dimensional unit vector, and there is also a special pixel value indicating that the pixel is not covered by the mesh.

### Scalar mode

Scalar mode has each pixel as a grayscale value in range 0 (black) to 255 (white).  The value zero (full black) means that the mesh does not cover this particular pixel.  All other values in range [1, 255] map to the range [-1.0, 1.0] according to the following formula:

    f(i) = (i - 128) / 127.0

In this case, the grayscale value 1 maps exactly to -1.0, full white (255) maps exactly to 1.0, and the grayscale value 128 maps exactly to 0.0.

### Vector mode

Vector mode has each pixel as an RGB value, where RGB channels each are in range [0, 255].

If all RGB channels are set to a value of zero (full black), this has the special interpretation that the mesh does not cover this particular pixel.

Except for that special value, all other pixel values only use values in range [1, 255] within their RGB channels.  Each RGB channel value maps to the range [-1.0, 1.0] according to the following formula:

    f(i) = (i - 128) / 127.0

In this case, the channel value 1 maps exactly to -1.0, the channel value 255 maps exactly to 1.0, and the channel value 128 maps exactly to 0.0.

These three RGB channel values are interpreted as the X, Y, and Z coordinates of a unit vector.  Let `r'` be the red channel mapped to range [-1.0, 1.0], `g'` the green channel mapped to range [-1.0, 1.0], and `b'` the blue channel mapped to range [-1.0, 1.0].  Then, the 3D unit vector encoded by each pixel value is:

    v(r', g', b') = (r' * <1, 0, 0>) + (g' * <0, 1, 0>) + (b' * <0, 0, 1>)

Not all RGB combinations are valid in this scheme.  For example, if each RGB channel is set to 128, this results in a vector <0, 0, 0> which is not a unit vector.  Only RGB combinations that map to unit vector (or very close to a unit vector) are valid, in addition to the special value where all channel values are set to zero to indicate the pixel is not covered by the mesh.
