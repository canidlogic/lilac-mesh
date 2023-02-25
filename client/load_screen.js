"use strict";

/*
 * load_screen.js
 * ==============
 * 
 * Module for handling the loading files screen of the Lilac Mesh
 * Editor.
 */

// Wrap everything in an anonymous function that we immediately invoke
// after it is declared -- this prevents anything from being implicitly
// added to global scope
(function() {
  
  /*
   * Local data
   * ==========
   */
  
  /*
   * The mesh data object that was loaded, or false if nothing loaded.
   */
  var m_mesh_data = false;
  
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
   * Handler function called once we have fully loaded the trace image
   * and optionally also the mesh data.
   * 
   * img is an <img> element that has been completely loaded with the
   * trace image and that has dimensions at least two.
   * 
   * mesh is false if there is no mesh data to load, or else a LilacMesh
   * to use.
   * 
   * Parameters:
   * 
   *   img : HTMLImageElement - the fully loaded tracing image
   * 
   *   m : LilacMesh | false - an object storing the initial mesh data,
   *   or false if no initial mesh data loaded
   */
  function fullLoad(img, m) {
    
    var func_name = "fullLoad";
    
    // Check parameters
    if (typeof img !== "object") {
      fault(func_name, 100);
    }
    if (!(img instanceof HTMLImageElement)) {
      fault(func_name, 200);
    }
    if ((img.naturalWidth < 2) || (img.naturalHeight < 2)) {
      fault(func_name, 250);
    }
    if (m !== false) {
      if (typeof m !== "object") {
        fault(func_name, 300);
      }
      if (!(m instanceof LilacMesh)) {
        fault(func_name, 400);
      }
    }
    
    // If no mesh was provided, get a blank mesh
    if (m === false) {
      m = new LilacMesh();
    }
    
    // Now we can show the main screen
    main_screen.show(img, m);
  }
  
  /*
   * Load the trace image from a data URL.
   * 
   * If the trace image loads correctly, fullLoad() will be invoked
   * asynchronously.
   * 
   * An exception is thrown if there is a problem.
   * 
   * Parameters:
   * 
   *   durl - a data URL containing the raw image to load
   */
  function loadTrace(durl) {
    
    var func_name = "loadTrace";
    var im;
    
    // Check parameter type
    if (typeof durl !== "string") {
      fault(func_name, 100);
    }
    
    // Create a new <img> element
    im = document.createElement("img");
    
    // Set error handler for <img> element so that it clears local state
    // and goes back to open page with an error message displayed
    im.onerror = function() {
      m_mesh_data = false;
      open_screen.show("trace");
    };
    
    // Set successful load handler for <img> element so that it invokes
    // fullLoad() -- but also check that dimensions are at least two
    // here, failing if they are not
    im.onload = function() {
      if ((im.naturalWidth >= 2) && (im.naturalHeight >= 2)) {
        fullLoad(im, m_mesh_data);
        m_mesh_data = false;
      } else {
        m_mesh_data = false;
        open_screen.show("trace");
      }
    };
    
    // Set the source of the <img> element to the given data URL so that
    // it starts loading asynchronously
    im.src = durl;
  }
  
  /*
   * Load the mesh object from a JSON string.
   * 
   * The result will be stored in the local m_mesh_data variable.  false
   * is stored if loading fails.
   * 
   * Parameters:
   * 
   *   str : string | mixed - the JSON string to decode
   */
  function loadMesh(str) {
    
    // Attempt to decode
    m_mesh_data = new LilacMesh();
    if (!m_mesh_data.fromJSON(str)) {
      m_mesh_data = false;
    }
  }
  
  /*
   * Public functions
   * ================
   */
  
  /*
   * Perform the load operation given File objects representing the
   * user-selected files.
   * 
   * fTrace is required.  fMesh is optional and can be set to false if
   * not provided.  If no mesh file is provided, the initial state will
   * be an empty mesh.
   * 
   * Parameters:
   * 
   *   fTrace : File - the trace image to load
   * 
   *   fMesh : File | false - the mesh file to load, or false if no mesh
   *   provided
   */
  function load(fTrace, fMesh) {
    
    var func_name = "load";
    var traceReader, meshReader;
    
    // Check parameters
    if (typeof fTrace !== "object") {
      fault(func_name, 100);
    }
    if (!(fTrace instanceof File)) {
      fault(func_name, 110);
    }
    if (fMesh !== false) {
      if (typeof fMesh !== "object") {
        fault(func_name, 120);
      }
      if (!(fMesh instanceof File)) {
        fault(func_name, 130);
      }
    }
    
    // Show the loading screen while we are working
    lilac_mesh_html.showDiv("loading");
    
    // Clear anything stored in the local variables
    m_mesh_data = false;
    
    // We are going to get both the file reader for the tracing image
    // and the file reader for the mesh file (if there is one) defined
    // before starting any operation so that they are ready
    traceReader = new FileReader();
    
    if (fMesh !== false) {
      meshReader = new FileReader();
    } else {
      meshReader = false;
    }
    
    // Define both the error and abort events so that we go back to the
    // open screen with a displayed error message after clearing local
    // state
    traceReader.onerror = function() {
      m_mesh_data = false;
      open_screen.show("trace");
    };
    traceReader.onabort = function() {
      m_mesh_data = false;
      open_screen.show("trace");
    };
    
    if (meshReader !== false) {
      meshReader.onerror = function() {
        m_mesh_data = false;
        open_screen.show("mesh");
      };
      meshReader.onabort = function() {
        m_mesh_data = false;
        open_screen.show("mesh");
      };
    }
    
    // Define the load events so that we route to an internal load
    // handler function with the data we read; also, if a mesh file is
    // defined, we will perform the loads in sequence so that the mesh
    // file load is attempted, and the trace image load is only
    // attempted if the mesh file loaded successfully
    if (meshReader !== false) {
      meshReader.onload = function() {
        // Call through to the handler, catching any exceptions here
        try {
          loadMesh(meshReader.result);
        } catch(e) {
          // Something went wrong loading the mesh file, so go back to
          // the open screen with an error and proceed no further; also,
          // clear local state
          open_screen.show("mesh");
          m_mesh_data = false;
          return;
        }
        
        if (m_mesh_data === false) {
          // Failure during loading mesh file, so go back to the open
          // screen with an error and proceed no further
          open_screen.show("mesh");
          return;
        }
        
        // If we got here successfully, our next step is to invoke the
        // the trace reader asynchronously
        traceReader.readAsDataURL(fTrace);
      };
    }
    
    traceReader.onload = function() {
      // Call through to the handler, catching any exceptions here
      try {
        loadTrace(traceReader.result);
      } catch(e) {
        // Something went wrong loading the trace image, so go back to
        // the open screen with an error and proceed no further; also,
        // clear local state
        open_screen.show("trace");
        m_mesh_data = false;
        return;
      }
      
      // The loadTrace() handler has to do another asynchronous call to
      // load the image, so nothing further required here
    };
    
    // Start things off either asynchronously reading the mesh file (if
    // one was provided) or asynchronously reading the trace file
    if (meshReader !== false) {
      meshReader.readAsText(fMesh);
    
    } else {
      traceReader.readAsDataURL(fTrace);
    }
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
