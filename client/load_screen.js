"use strict";

/*
 * load_screen.js
 * ==============
 * 
 * Module for handling loading data files during initialization of the
 * Lilac Mesh Editor when the splash screen is showing.
 */

// Wrap everything in an anonymous function that we immediately invoke
// after it is declared -- this prevents anything from being implicitly
// added to global scope
(function() {
  
  /*
   * Local functions
   * ===============
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
  function fault(func_name, loc) {
    
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
                  " in load_screen");
    
    // Throw exception
    throw ("load_screen:" + func_name + ":" + String(loc));
  }
  
  /*
   * Load function that is called once we have determined the path to
   * the tracing image from the client-side configuration file and also
   * loaded the initial mesh state from the mesh file.
   * 
   * Parameters:
   * 
   *   trace_path : string - the path to the tracing image
   * 
   *   mesh : LilacMesh - the initial mesh state
   */
  function loadWithMesh(trace_path, mesh) {
    
    var func_name = "loadWithMesh";
    var im;
    
    // Check parameters
    if (typeof trace_path !== "string") {
      fault(func_name, 100);
    }
    if ((typeof mesh !== "object") || (!(mesh instanceof LilacMesh))) {
      fault(func_name, 110);
    }
    
    // All we have left to do is load the tracing image, but we will use
    // an <img> element to load this rather than an XMLHttpRequest, so
    // create a new <img> element
    im = document.createElement("img");
    
    // Set error handler for <img> element so that it loadFailed()
    im.onerror = function() {
      lilac_mesh_html.loadFailed("Tracing image failed to load!");
    };
    
    // Function continues in successful load handler for <img> element
    im.onload = function() {
      
      // First of all, check that loaded image has width and height of
      // at least two
      if ((im.naturalWidth < 2) || (im.naturalHeight < 2)) {
        lilac_mesh_html.loadFailed(
          "Tracing image dimensions must both be at least two!");
        return;
      }
      
      // We now have a valid and loaded trace image as well as our
      // initial mesh state loaded, so we can finally show the main
      // screen
      main_screen.show(im, mesh);
    };
    
    // Set the source of the <img> element to the given trace path so
    // that it starts loading asynchronously
    im.src = trace_path;
  }
  
  /*
   * Load function that is called once we have determined the path to
   * the tracing image from the client-side configuration file.
   * 
   * Parameters:
   * 
   *   trace_path : string - the path to the tracing image
   */
  function loadWithTracePath(trace_path) {
    
    var func_name = "loadWithTracePath";
    var request;
    
    // Check parameter
    if (typeof trace_path !== "string") {
      fault(func_name, 100);
    }
    
    // We want to load the mesh file before the tracing image because it
    // is likely to be a much smaller file, so create a new request
    // object and open a request for the mesh file that will be
    // retrieved as a text string
    request = new XMLHttpRequest();
    request.open("GET", "/mesh.json");
    request.responseType = "text";
    
    // The function will continue within the asynchronous handler for
    // the request
    request.onreadystatechange = function() {
      
      var result;
      var m;
      
      // Ignore the event if the process isn't complete
      if (request.readyState !== 4) {
        return;
      }
      
      // If the request wasn't successful, then loadFailed() and proceed
      // no further
      if (request.status !== 200) {
        lilac_mesh_html.loadFailed("Failed to read /mesh.json!");
        return;
      }
      
      // If we got here, we successfully loaded the file as text, so get
      // the text as a string
      result = request.responseText;
      
      // Create a new LilacMesh and try to load it from the mesh file
      m = new LilacMesh();
      if (!m.fromJSON(result)) {
        lilac_mesh_html.loadFailed(
          "/mesh.json was not a valid mesh file!");
        return;
      }
      
      // If we got here, we successfully loaded the mesh from the file,
      // so proceed with the next load stage
      loadWithMesh(trace_path, m);
    };
    
    // Asynchronously start the request
    request.send(null);
  }
  
  /*
   * Public functions
   * ================
   */
  
  /*
   * Perform the client-side webapp initialization.
   * 
   * This is intended to be called at the start of the program while the
   * splash screen is being displayed.  However, you should register
   * event handlers for all the various user interface modules before
   * calling this function.
   * 
   * The loading screen will first load the client-side configuration
   * data from "/config.json".  Then, it will load the initial mesh file
   * from "/mesh.json".  Finally, it will load the tracing image from
   * the path given in the client-side configuration data.
   * 
   * If everything is successful, this function will call the show()
   * function of the main_screen module with the loaded trace image and
   * the initial mesh state.
   * 
   * If there is a problem, this function will invoke the loadFailed()
   * function of the lilac_mesh_html module, passing a string indicating
   * what the problem was.
   * 
   * Note that loading is asynchronous.  This function returns right
   * away after scheduling the first load.  The show() function of the
   * main_screen module or the loadFailed() function of the presentation
   * lilac_mesh_html module will be invoked only later.
   */
  function load() {
    
    var request;
    
    // We begin by loading the client-side configuration file, so create
    // a new request object and open a request for the config file that
    // will be retrieved as a text string
    request = new XMLHttpRequest();
    request.open("GET", "/config.json");
    request.responseType = "text";
    
    // The function will continue within the asynchronous handler for
    // the request
    request.onreadystatechange = function() {
      
      var result;
      
      // Ignore the event if the process isn't complete
      if (request.readyState !== 4) {
        return;
      }
      
      // If the request wasn't successful, then loadFailed() and proceed
      // no further
      if (request.status !== 200) {
        lilac_mesh_html.loadFailed("Failed to read /config.json!");
        return;
      }
      
      // If we got here, we successfully loaded the file as text, so get
      // the text as a string
      result = request.responseText;
      
      // Parse the result as JSON
      try {
        result = JSON.parse(result);
      } catch (ex) {
        lilac_mesh_html.loadFailed(
            "Failed to parse /config.json as JSON!");
        return;
      }
      
      // The parsed JSON must be an object
      if ((typeof result !== "object") || (result instanceof Array)) {
        lilac_mesh_html.loadFailed(
          "/config.json is not a JSON object!");
        return;
      }
      
      // The parsed JSON must have a property "trace_image" that is a
      // string
      if ((!("trace_image" in result)) ||
            (typeof result.trace_image !== "string")) {
        lilac_mesh_html.loadFailed(
          "/config.json is missing a trace_image property " +
          "with string value!");
        return;
      }
      
      // We can now call through to the next load stage with the path to
      // the tracing image
      loadWithTracePath(result.trace_image);
    };
    
    // Asynchronously start the request
    request.send(null);
  }
  
  /*
   * Export declarations
   * ===================
   * 
   * All exports are declared within a global "load_screen" object.
   */
  window.load_screen = {
    "load": load
  };
  
}());
