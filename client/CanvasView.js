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
  
  // Start the magnification stack out -- _magstack is an array that
  // expands and contracts with push() and pop(), and the elements are
  // six-element arrays [sw, sh, dx, dy, dw, dh] that store the
  // dimensions of the source area and the full destination area that
  // define the magnification level (the center of the view is not part
  // of the magnification, so the source area coordinates are left out);
  // the bottom of the stack is always the initial magnification level
  // and is never removed; _magout is true if the magnification stack is
  // storing magnifications that are progressively zoomed out or it is
  // false if the magnification stack is storing magnifications that are
  // progressively zoomed in; if the stack just has one element, _magout
  // must still be defined as a boolean but its value has no meaning
  this._magstack = [];
  this._magstack.push([
    this._sw, this._sh, this._dx, this._dy, this._dw, this._dh
  ]);
  this._magout = false;
}

/*
 * Private constants
 * =================
 */

/*
 * One greater than the maximum number of times that one can zoom in or
 * zoom out from the initial magnification level.
 */
CanvasView._MAX_ZOOM_STEPS = 50;

/*
 * The scaling multiplier that controls how fast one zooms in or zooms
 * out in each magnification step.
 * 
 * This must be greater than one for magnification to work correctly.
 */
CanvasView._ZOOM_SCALE = 1.5;

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
 * Set the source X and source Y of the view so that the point (nx, ny)
 * in normalized image space is centered as much as possible.
 * 
 * This completely overwrites the sx and sy values of the view without
 * depending on their current value, so it can be used in the zooming
 * functions for resetting the (sx, sy) coordinates after a zoom
 * operation.
 * 
 * The given (nx, ny) coordinates just need to be numbers.  If they are
 * non-finite, they are set to zero.  If they are finite, they are
 * clamped to range [0.0, 1.0] by this function.  So you can pass any
 * number value in and this function will correct as needed.
 * 
 * Parameters:
 * 
 *   nx : number - the normalized X coordinate of the center
 * 
 *   ny : number - the normalized Y coordinate of the center
 */
CanvasView.prototype.centerAt = function(nx, ny) {
  
  var func_name = "centerAt";
  var sx, sy;
  var rx, ry;
  
  // Check parameters
  if ((typeof nx !== "number") || (typeof ny !== "number")) {
    CanvasView._fault(func_name, 100);
  }
  
  // Adjust non-finite parameter values
  if (!isFinite(nx)) {
    nx = 0;
  }
  if (!isFinite(ny)) {
    ny = 0;
  }
  
  // Clamp parameter values
  nx = Math.max(nx, 0);
  ny = Math.max(ny, 0);
  
  nx = Math.min(nx, 1);
  ny = Math.min(ny, 1);
  
  // Invert the Y value to convert to top-left orientation
  ny = 1 - ny;
  
  // Start with (sx, sy) at the position indicated by (nx, ny) when
  // scaling by image dimensions
  sx = nx * this._im_width;
  sy = ny * this._im_height;
  
  // In order to center (sx, sy), adjust by half the source width and
  // height
  sx = sx - (this._sw / 2);
  sy = sy - (this._sh / 2);
  
  // Compute how much the width and height overshoots the image
  // boundaries with (sx, sy), or set overshoot to zero if it doesn't
  rx = 0;
  if (sx + this._sw > this._im_width) {
    rx = (sx + this._sw) - this._im_width;
  }
  
  ry = 0;
  if (sy + this._sh > this._im_height) {
    ry = (sy + this._sh) - this._im_height;
  }
  
  // We don't want to have negative source coordinates, so clamp rx and
  // ry by sx and sy
  rx = Math.min(sx, rx);
  ry = Math.min(sy, ry);
  
  // Adjust by rx and ry
  sx = sx - rx;
  sy = sy - ry;
  
  // Update (sx, sy)
  this._sx = sx;
  this._sy = sy;
};

/*
 * Adjust the source window by the given relative coordinates, but
 * keeping the source window within range of the source image.
 * 
 * Also, the relative coordinates are assumed to be in the scale of the
 * *destination* area, so this function scales them appropriately for
 * the source area.
 * 
 * Parameters:
 * 
 *   rx : number - the relative X displacement
 * 
 *   ry : number - the relative Y displacement
 */
CanvasView.prototype.translate = function(rx, ry) {
  
  var func_name = "translate";
  var tx, ty;
  var rx, ry;
  
  // Check parameters
  if ((typeof rx !== "number") || (typeof ry !== "number")) {
    CanvasView._fault(func_name, 100);
  }
  
  // Scale parameters to source area
  rx = (rx * this._sw) / this._dw;
  ry = (ry * this._sh) / this._dh;
  
  // Set non-finite parameters to zero
  if (!isFinite(rx)) {
    rx = 0;
  }
  if (!isFinite(ry)) {
    ry = 0;
  }
  
  // Clamp each parameter to a maximum of the image dimensions
  rx = Math.min(rx, this._im_width);
  ry = Math.min(ry, this._im_height);
  
  // Compute the target (x, y) coordinates of the source window
  tx = this._sx + rx;
  ty = this._sy + ry;
  
  // Clamp target coordinates to valid range
  tx = Math.max(0, tx);
  ty = Math.max(0, ty);
  
  tx = Math.min(this._im_width - 1, tx);
  ty = Math.min(this._im_height - 1, ty);
  
  // Determine the width and height overshoot, if any
  rx = 0;
  ry = 0;
  
  if (tx + this._sw > this._im_width) {
    rx = (tx + this._sw) - this._im_width;
  }
  if (ty + this._sh > this._im_height) {
    ry = (ty + this._sh) - this._im_height;
  }
  
  // Adjust to remove overshoot
  tx = tx - rx;
  ty = ty - ry;
  
  // Update window coordinates
  this._sx = tx;
  this._sy = ty;
};

/*
 * Adjust the view to zoom in, keeping the current center of the view as
 * much as is possible.
 * 
 * If the maximum zoom-in level has already been reached, this call is
 * ignored.
 * 
 * A stack is used for magnification levels to prevent accumulation of
 * rounding errors over time.
 */
CanvasView.prototype.zoomIn = function() {
  
  var func_name = "zoomIn";
  var nx, ny;
  var r;
  var m;

  // If stack is for zooming in and we've reached the maximum stack
  // size, then ignore the call
  if ((this._magout === false) &&
      (this._magstack.length >= CanvasView._MAX_ZOOM_STEPS)) {
    return;
  }
  
  // Compute the normalized image center of the current source view,
  // also flipping Y to be oriented to bottom-left
  nx = this._sx + (this._sw / 2);
  ny = this._sy + (this._sh / 2);
  
  nx = nx / this._im_width;
  ny = ny / this._im_height;
  
  ny = 1 - ny;
  
  // Zoom-in is handled differently depending on how the magnification
  // stack is currently oriented
  if ((this._magout) && (this._magstack.length > 1)) {
    // Stack is oriented for zooming out and there is at least one
    // zoom-out level, so pop the magnification stack and the top of the
    // magnification stack will be our new source and destination
    // dimensions
    this._magstack.pop();

    // Restore source and destination from top of stack, all except the
    // source (x, y) which is not included in stack
    m = this._magstack[this._magstack.length - 1];
    
    this._sw = m[0];
    this._sh = m[1];
    this._dx = m[2];
    this._dy = m[3];
    this._dw = m[4];
    this._dh = m[5];
    
    // Set source (x, y) by centering
    this.centerAt(nx, ny);
    
  } else {
  
    // Stack has only one element or stack is oriented for zooming in,
    // so first make sure orientation is zooming in
    this._magout = false;
    
    // We will zoom in first by decreasing the source dimensions by the
    // scaling factor
    this._sw = this._sw / CanvasView._ZOOM_SCALE;
    this._sh = this._sh / CanvasView._ZOOM_SCALE;
    
    // Re-center the source window as close as possible to our previous
    // center
    this.centerAt(nx, ny);
    
    // If either X or Y in the destination window is non-zero, we may
    // need to expand the view
    if (this._dx > 0) {
      // Destination X coordinate is greater than zero, so we need to
      // widen the view -- first, figure out how much we can widen
      // relative to the width, taking both the source and destination
      // windows into account
      r = Math.min(
            (this._cv_width / this._dw),
            (this._im_width / this._sw)
          );
      
      // Widen the source and destination windows, clamping to maximum
      this._dw = Math.min(this._dw * r, this._cv_width);
      this._sw = Math.min(this._sw * r, this._im_width);
      
      // Center the destination window
      this._dx = (this._cv_width - this._dw) / 2;
      
      // Apply centering to source window again
      this.centerAt(nx, ny);
      
    } else if (this._dy > 0) {
      // Destination Y coordinate is greater than zero, so we need to
      // expand view vertically -- first, figure out how much we can
      // expand relative to the height, taking both the source and
      // destination windows into account
      r = Math.min(
            (this._cv_height / this._dh),
            (this._im_height / this._sh)
          );
      
      // Expand the source and destination windows, clamping to maximum
      this._dh = Math.min(this._dh * r, this._cv_height);
      this._sh = Math.min(this._sh * r, this._im_height);
      
      // Center the destination window
      this._dy = (this._cv_height - this._dh) / 2;
      
      // Apply centering to source window again
      this.centerAt(nx, ny);
    }
  
    // Push the current magnification state onto the stack
    this._magstack.push([
      this._sw, this._sh,
      this._dx, this._dy, this._dw, this._dh
    ]);
  }
};

/*
 * Adjust the view to zoom out, keeping the current center of the view
 * as much as is possible.
 * 
 * If the maximum zoom-out level has already been reached, this call is
 * ignored.
 * 
 * A stack is used for magnification levels to prevent accumulation of
 * rounding errors over time.
 */
CanvasView.prototype.zoomOut = function() {
  
  var func_name = "zoomOut";
  var nx, ny;
  var dx, dy, dw, dh;
  var m;
  
  // If stack is for zooming out and we've reached the maximum stack
  // size, then ignore the call
  if ((this._magout === true) &&
      (this._magstack.length >= CanvasView._MAX_ZOOM_STEPS)) {
    return;
  }
  
  // Zoom-out is handled differently depending on how the magnification
  // stack is currently oriented
  if ((!(this._magout)) && (this._magstack.length > 1)) {
    // Stack is oriented for zooming in and there is at least one 
    // zoom-in level, so pop the magnification stack and the top of the
    // magnification stack will be our new source and destination
    // dimensions
    this._magstack.pop();

    // Compute the normalized image center of the current source view,
    // also flipping Y to be oriented to bottom-left
    nx = this._sx + (this._sw / 2);
    ny = this._sy + (this._sh / 2);
    
    nx = nx / this._im_width;
    ny = ny / this._im_height;
    
    ny = 1 - ny;
    
    // Restore source and destination from top of stack, all except the
    // source (x, y) which is not included in stack
    m = this._magstack[this._magstack.length - 1];
    
    this._sw = m[0];
    this._sh = m[1];
    this._dx = m[2];
    this._dy = m[3];
    this._dw = m[4];
    this._dh = m[5];
    
    // Set source (x, y) by centering
    this.centerAt(nx, ny);
    
  } else {
  
    // Stack has only one element or stack is oriented for zooming out,
    // so first make sure orientation is zooming out
    this._magout = true;
    
    // Initial zoom level always has full image displayed in destination
    // view, so we just have to decrease the destination dimensions by
    // the scaling factor and keep them in the center
    dw = this._dw / CanvasView._ZOOM_SCALE;
    dh = this._dh / CanvasView._ZOOM_SCALE;
    
    dx = this._dx + ((this._dw - dw) / 2);
    dy = this._dy + ((this._dh - dh) / 2);
    
    // Update the current state of the destination
    this._dx = dx;
    this._dy = dy;
    this._dw = dw;
    this._dh = dh;
  
    // Push the current magnification state onto the stack
    this._magstack.push([
      this._sw, this._sh,
      this._dx, this._dy, this._dw, this._dh
    ]);
  }
};

/*
 * Map an X coordinate on the canvas to a normalized image X coordinate
 * in range [0.0, 1.0].
 * 
 * If the given canvas X coordinate is not on the image, it is clamped
 * to the nearest boundary.
 * 
 * Parameters:
 * 
 *   x : number - the canvas X coordinate
 * 
 * Return:
 * 
 *   the corresponding normalized image X coordinate
 */
CanvasView.prototype.mapToNormX = function(x) {
  
  var func_name = "mapToNormX";
  
  // Check parameter
  if (typeof x !== "number") {
    CanvasView._fault(func_name, 100);
  }
  
  // If number is not finite, return zero
  if (!isFinite(x)) {
    return 0;
  }
  
  // If coordinate is not in the destination range, clamp
  if (!(x >= this.dx)) {
    return 0;
    
  } else if (!(x <= (this.dx + this.dw - 1))) {
    return 1;
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
 * If the given canvas Y coordinate is not on the image, it is clamped
 * to the nearest boundary.
 * 
 * Parameters:
 * 
 *   y : number - the canvas Y coordinate
 * 
 * Return:
 * 
 *   the corresponding normalized image Y coordinate
 */
CanvasView.prototype.mapToNormY = function(y) {
  
  var func_name = "mapToNormY";
  
  // Check parameter
  if (typeof y !== "number") {
    CanvasView._fault(func_name, 100);
  }
  
  // If number is not finite, return zero
  if (!isFinite(y)) {
    return 0;
  }
  
  // If coordinate is not in the destination range, clamp, remembering
  // to invert the Y coordinate
  if (!(y >= this.dy)) {
    return 1;
    
  } else if (!(y <= (this.dy + this.dh - 1))) {
    return 0;
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
