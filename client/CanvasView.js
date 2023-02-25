"use strict";

/*
 * CanvasView.js
 * =============
 * 
 * Definition of CanvasView class.
 */

/*
 * Constructor definition
 * ======================
 */

/*
 * Constructor for CanvasView objects.
 * 
 * Invoke this with the "new" keyword to construct a new CanvasView
 * object.
 * 
 * Provide the dimensions in pixels of the image and the dimensions in
 * pixels of the canvas.
 * 
 * All dimensions must be integers that are greater than one.
 * 
 * Parameters:
 * 
 *   im_width : number(int) - width in pixels of the image
 * 
 *   im_height : number(int) - height in pixels of the image
 * 
 *   cv_width : number(int) - width in pixels of the canvas
 * 
 *   cv_height : number(int) - height in pixels of the canvas
 */
function CanvasView(im_width, im_height, cv_width, cv_height) {
  
  var func_name = "constructor";
  var rx, ry;
  var wscale, hscale, fscale;
  
  // Check parameters
  if ((typeof im_width !== "number") ||
      (typeof im_height !== "number") ||
      (typeof cv_width !== "number") ||
      (typeof cv_height !== "number")) {
    CanvasView._fault(func_name, 100);
  }
  
  if ((!isFinite(im_width)) || (!isFinite(im_height)) ||
      (!isFinite(cv_width)) || (!isFinite(cv_height))) {
    CanvasView._fault(func_name, 200);
  }
  
  if ((im_width !== Math.floor(im_width)) ||
      (im_height !== Math.floor(im_height)) ||
      (cv_width !== Math.floor(cv_width)) ||
      (cv_height !== Math.floor(cv_height))) {
    CanvasView._fault(func_name, 300);
  }
  
  if ((im_width < 2) || (im_height < 2) ||
      (cv_width < 2) || (cv_height < 2)) {
    CanvasView._fault(func_name, 400);
  }
  
  // Store the parameters as private properties
  this._im_width = im_width;
  this._im_height = im_height;
  this._cv_width = cv_width;
  this._cv_height = cv_height;
  
  // If the image fits entirely within the canvas, then the initial view
  // is just the image centered in the canvas; else, initial view has
  // image scaled to fit within the viewport with the proper aspect
  // ratio
  if ((this._im_width <= this._cv_width) &&
      (this._im_height <= this._cv_height)) {
    // Image fits entirely within viewport, so source rectangle is the
    // entire image
    this._sx = 0;
    this._sy = 0;
    this._sw = this._im_width;
    this._sh = this._im_height;
    
    // Destination width and height are the same as source
    this._dw = this._sw;
    this._dh = this._sh;
    
    // Get the remainder space in destination X and Y
    rx = 0;
    if (this._dw < this._cv_width) {
      rx = this._cv_width - this._dw;
    }
    
    ry = 0;
    if (this._dh < this._cv_height) {
      ry = this._cv_height - this._dh;
    }
    
    // Destination X and Y are half the remainders so we center the
    // image
    this._dx = rx / 2;
    this._dy = ry / 2;
    
  } else {
    // Image doesn't fit entirely within viewport, so determine how much
    // greater the width and height of the image are than the canvas,
    // setting the dimension scale to 1.0 if they are not greater
    wscale = 1;
    if (this._im_width > this._cv_width) {
      wscale = this._im_width / this._cv_width;
    }
    
    hscale = 1;
    if (this._im_height > this._cv_height) {
      hscale = this._im_height / this._cv_height;
    }
    
    // The full scaling value is the greater of the width and height
    // scale
    fscale = Math.max(wscale, hscale);
    
    // We will be showing the full image, so source rectangle is the
    // entire image
    this._sx = 0;
    this._sy = 0;
    this._sw = this._im_width;
    this._sh = this._im_height;
    
    // Compute destination width and height by scaling
    this._dw = this._sw / fscale;
    this._dh = this._sh / fscale;
    
    // Get the remainder space in destination X and Y
    rx = 0;
    if (this._dw < this._cv_width) {
      rx = this._cv_width - this._dw;
    }
    
    ry = 0;
    if (this._dh < this._cv_height) {
      ry = this._cv_height - this._dh;
    }
    
    // Destination X and Y are half the remainders so we center the
    // scaled image
    this._dx = rx / 2;
    this._dy = ry / 2;    
  }
  
  // We have now initialized _sx, _sy, _sw, _sh, _dx, _dy, _dw, _dh so
  // we just add read-only properties to access these, as well as the
  // imageWidth, imageHeight, canvasWidth, canvasHeight properties
  Object.defineProperties(this, {
    sx: {
      get: function() { return this._sx; },
      enumerable: true,
      configurable: true
    },
    sy: {
      get: function() { return this._sy; },
      enumerable: true,
      configurable: true
    },
    sw: {
      get: function() { return this._sw; },
      enumerable: true,
      configurable: true
    },
    sh: {
      get: function() { return this._sh; },
      enumerable: true,
      configurable: true
    },
    dx: {
      get: function() { return this._dx; },
      enumerable: true,
      configurable: true
    },
    dy: {
      get: function() { return this._dy; },
      enumerable: true,
      configurable: true
    },
    dw: {
      get: function() { return this._dw; },
      enumerable: true,
      configurable: true
    },
    dh: {
      get: function() { return this._dh; },
      enumerable: true,
      configurable: true
    },
    imageWidth: {
      get: function() { return this._im_width; },
      enumerable: true,
      configurable: true
    },
    imageHeight: {
      get: function() { return this._im_height; },
      enumerable: true,
      configurable: true
    },
    canvasWidth: {
      get: function() { return this._cv_width; },
      enumerable: true,
      configurable: true
    },
    canvasHeight: {
      get: function() { return this._cv_height; },
      enumerable: true,
      configurable: true
    }
  });
}

/*
 * Private static functions
 * ========================
 */

/*
 * Report an error to console and throw an exception for a fault
 * occurring within this module.
 *
 * Parameters:
 *
 *   func_name : string - the name of the function in this module
 *
 *   loc : number(int) - the location within the function
 */
CanvasView._fault = function(func_name, loc) {
  // If parameters not valid, set to unknown:0
  if ((typeof func_name !== "string") || (typeof loc !== "number")) {
    func_name = "unknown";
    loc = 0;
  }
  loc = Math.floor(loc);
  if (!isFinite(loc)) {
    loc = 0;
  }
  
  // Report error to console
  console.log("Fault at " + func_name + ":" + String(loc) +
                " in CanvasView");
  
  // Throw exception
  throw ("CanvasView:" + func_name + ":" + String(loc));
};

/*
 * Given a CanvasView object, compute what normalized X coordinates in
 * range [0.0, 1.0] should be multiplied by to achieve same scale as
 * current view.
 * 
 * Parameters:
 * 
 *   cv : CanvasView - the view to compute the value for
 * 
 * Return:
 * 
 *   the computed value
 */
CanvasView._computeScaleX = function(cv) {
  
  var func_name = "_computeScaleX";
  var result;
  
  // Check parameter
  if (typeof cv !== "object") {
    CanvasView._fault(func_name, 100);
  }
  if (!(cv instanceof CanvasView)) {
    CanvasView._fault(func_name, 110);
  }
  
  // First of all, set result to value necessary to scale to source
  // image size
  result = cv.imageWidth;
  
  // We then need to multiply by the scaling used to transform source
  // width to destination width
  result = result * (cv.dw / cv.sw);
  
  // Return result
  return result;
};

/*
 * Given a CanvasView object, compute what normalized Y coordinates in
 * range [0.0, 1.0] should be multiplied by to achieve same scale as
 * current view.
 * 
 * Parameters:
 * 
 *   cv : CanvasView - the view to compute the value for
 * 
 * Return:
 * 
 *   the computed value
 */
CanvasView._computeScaleY = function(cv) {
  
  var func_name = "_computeScaleY";
  var result;
  
  // Check parameter
  if (typeof cv !== "object") {
    CanvasView._fault(func_name, 100);
  }
  if (!(cv instanceof CanvasView)) {
    CanvasView._fault(func_name, 110);
  }
  
  // First of all, set result to value necessary to scale to source
  // image size
  result = cv.imageHeight;
  
  // We then need to multiply by the scaling used to transform source
  // height to destination height
  result = result * (cv.dh / cv.sh);
  
  // Return result
  return result;
};

/*
 * Public instance functions
 * =========================
 */

/*
 * Map an X coordinate on the canvas to a normalized image X coordinate
 * in range [0.0, 1.0].
 * 
 * false is returned if the given canvas X coordinate is not on the
 * image.
 * 
 * Parameters:
 * 
 *   x : number - the canvas X coordinate
 * 
 * Return:
 * 
 *   the corresponding normalized image X coordinate, or false
 */
CanvasView.prototype.mapToNormX = function(x) {
  
  var func_name = "mapToNormX";
  
  // Check parameter
  if (typeof x !== "number") {
    CanvasView._fault(func_name, 100);
  }
  
  // If number is not finite, don't map
  if (!isFinite(x)) {
    return false;
  }
  
  // If coordinate is not in the destination range, don't map
  if (!((x >= this.dx) && (x <= (this.dx + this.dw - 1)))) {
    return false;
  }
  
  // Convert coordinate to offset from start of destination range
  x = x - this.dx;
  
  // Scale coordinate to be in normalized X range
  x = x / CanvasView._computeScaleX(this);
  
  // Finally, add the source X coordinate scaled to normalized range
  x = x + (this.sx / (this.imageWidth - 1));
  
  // Return the transformed point
  return x;
};

/*
 * Map a Y coordinate on the canvas to a normalized image X coordinate
 * in range [0.0, 1.0].
 * 
 * false is returned if the given canvas Y coordinate is not on the
 * image.
 * 
 * Parameters:
 * 
 *   y : number - the canvas Y coordinate
 * 
 * Return:
 * 
 *   the corresponding normalized image Y coordinate, or false
 */
CanvasView.prototype.mapToNormY = function(y) {
  
  var func_name = "mapToNormY";
  
  // Check parameter
  if (typeof y !== "number") {
    CanvasView._fault(func_name, 100);
  }
  
  // If number is not finite, don't map
  if (!isFinite(y)) {
    return false;
  }
  
  // If coordinate is not in the destination range, don't map
  if (!((y >= this.dy) && (y <= (this.dy + this.dh - 1)))) {
    return false;
  }
  
  // Convert coordinate to offset from start of destination range
  y = y - this.dy;
  
  // Scale coordinate to be in normalized Y range
  y = y / CanvasView._computeScaleY(this);
  
  // Add the source Y coordinate scaled to normalized range
  y = y + (this.sy / (this.imageHeight - 1));
  
  // Finally, invert Y to make the origin the bottom-left of the image
  y = 1.0 - y;
  
  // Return the transformed point
  return y;
};

/*
 * Map an X coordinate from a normalized image coordinate in range
 * [0.0, 1.0] to a pixel X coordinate on the canvas.
 * 
 * An exception is thrown if the given parameter is not in normalized
 * range [0.0, 1.0].
 * 
 * The returned coordinate may not actually be within the boundaries of
 * the canvas.
 * 
 * Parameters:
 * 
 *   x : number - the normalized X coordinate
 * 
 * Return:
 * 
 *   the corresponding canvas X coordinate
 */
CanvasView.prototype.mapFromNormX = function(x) {
  
  var func_name = "mapFromNormX";
  
  // Check parameter
  if (typeof x !== "number") {
    CanvasView._fault(func_name, 100);
  }
  if (!isFinite(x)) {
    CanvasView._fault(func_name, 110);
  }
  if (!((x >= 0) && (x <= 1))) {
    CanvasView._fault(func_name, 120);
  }
  
  // First, subtract the source X coordinate scaled to normalized range
  x = x - (this.sx / (this.imageWidth - 1));
  
  // Scale coordinate to be in canvas X range
  x = x * CanvasView._computeScaleX(this);
  
  // Offset coordinate from start of destination range
  x = x + this.dx;
  
  // Return the transformed point
  return x;
};

/*
 * Map a Y coordinate from a normalized image coordinate in range
 * [0.0, 1.0] to a pixel Y coordinate on the canvas.
 * 
 * An exception is thrown if the given parameter is not in normalized
 * range [0.0, 1.0].
 * 
 * The returned coordinate may not actually be within the boundaries of
 * the canvas.
 * 
 * Parameters:
 * 
 *   y : number - the normalized Y coordinate
 * 
 * Return:
 * 
 *   the corresponding canvas Y coordinate
 */
CanvasView.prototype.mapFromNormY = function(y) {
  
  var func_name = "mapFromNormY";
  
  // Check parameter
  if (typeof y !== "number") {
    CanvasView._fault(func_name, 100);
  }
  if (!isFinite(y)) {
    CanvasView._fault(func_name, 110);
  }
  if (!((y >= 0) && (y <= 1))) {
    CanvasView._fault(func_name, 120);
  }
  
  // First, subtract normalized Y from 1.0 to convert origin to top-left
  // corner used with images
  y = 1.0 - y;
  
  // Next, subtract the source Y coordinate scaled to normalized range
  y = y - (this.sy / (this.imageHeight - 1));
  
  // Scale coordinate to be in canvas Y range
  y = y * CanvasView._computeScaleY(this);
  
  // Offset coordinate from start of destination range
  y = y + this.dy;
  
  // Return the transformed point
  return y;
};
