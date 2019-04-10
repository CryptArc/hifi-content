//
//  drawSphereClient.js
//
//  Created by Rebecca Stankus 3/28/2019
//  Copyright 2019 High Fidelity, Inc.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html

(function() {
    var _this;

    var EQUIP_MINIMUM_TIME = 1000;
    var CURSOR_TEXTURE_URL = Script.resolvePath("cursor.png");
    var BEGIN_STROKE_SOUND = SoundCache.getSound(Script.resolvePath('sfx/markerBeginStroke.wav'));
    var EQUIP_SOUND = SoundCache.getSound(Script.resolvePath('sfx/equip_marker.wav'));
    var UNEQUIP_SOUND = SoundCache.getSound(Script.resolvePath('sfx/unequip_marker.wav'));
    var STROKEL1_SOUND = SoundCache.getSound(Script.resolvePath('sfx/strokeL1.wav'));
    var STROKER1_SOUND = SoundCache.getSound(Script.resolvePath('sfx/strokeR1.wav'));
    var STROKER2_SOUND = SoundCache.getSound(Script.resolvePath('sfx/strokeR2.wav'));
    var STROKER3_SOUND = SoundCache.getSound(Script.resolvePath('sfx/strokeR3.wav'));  
    var STROKE_SOUND_ARRAY = [STROKEL1_SOUND, STROKER1_SOUND, STROKER2_SOUND, STROKER3_SOUND];
    var SOUND_TIMESTAMP_LIMIT = {
        min: 100,
        max: 300
    };
    var SOUND_TIMESTAMP = 220;
    var STROKE_SOUND_VOLUME = {
        min: 0.4,
        max: 0.6
    };
    var HAPTIC_PARAMETERS = {
        strength: 1,
        duration: 50,
        hand: 2
    };
    var STROKE_SOUND_THRESHOLD_DIRECTION = 0.85;
    var WHITEBOARD_SEARCH_RADIUS_M = 5;
    var SHORT_TOOL_LIFETIME = 3600;
    var MARKER_TOOL_LIFETIME = 90;
    var WAIT_TO_CLEAN_UP_MS = 2000;
    var WAIT_TO_REOPEN_APP_MS = 500;
    var MINIMUM_TRIGGER_PRESS_VALUE = 0.97;
    var REPEAT_DISTANCE_CHECK_MS = 60;
    var MINIMUM_MOVEMENT_TO_DRAW_M = 0.0005;
    var MAXIMUM_MOVEMENT_TO_DRAW_M = 0.1;
    var DEFAULT_NORMAL = { x: 0, y: 0, z: 1 };
    var DECAY_TIME_S = 60;
    var MAX_LINE_POINTS = 100;
    var DRAW_SOUND = SoundCache.getSound(Script.resolvePath('../resources/sounds/draw.mp3'));
    var DRAW_SOUND_VOLUME = 0.08;
    var DELETE_AGAIN_MS = 100;
    var MAXIMUM_DISTANCE_TO_SEARCH_M = 1;
    var MAXIMUM_DISTANCE_TO_DELETE_M = 0.03;
    var DISTANCE_TO_DRAW_IN_FRONT_OF_CAMERA_DESKTOP_M = 1.5;
    var DRAW_ON_BOARD_DISTANCE_HMD_M = 0.1;
    var DRAW_ON_BOARD_DISTANCE_DESKTOP_M = 3;
    var OPEN_SOUND = SoundCache.getSound(Script.resolvePath('../resources/sounds/open.mp3'));
    var OPEN_SOUND_VOLUME = 0.02;
    var CLOSE_SOUND = SoundCache.getSound(Script.resolvePath('../resources/sounds/close.mp3'));
    var CLOSE_SOUND_VOLUME = 0.02;
    var WAIT_TO_CLEAN_UP_MS = 2000;
    var WAIT_TO_REOPEN_APP_MS = 500;
    var WAIT_FOR_ENTITIES_TO_LOAD_MS = 300;
    var STROKE_FORWARD_OFFSET_M = 0.01;
    var DEFAULT_LINE_PROPERTIES = {
        type: "PolyLine",
        name: "Whiteboard Polyline",
        isUVModeStretch: true,
        lifetime: DECAY_TIME_S,
        collisionless: true,
        grab: { grabbable: false }
    };
    var HALF = 0.5;

    var isPainting = false;
    var readyToDraw = false;
    var isMouseDown = false;
    var isStartingStroke = false;
    var lastIntersectionPoint = undefined;
    var lineResolution = 0.01;
    var timestamp = null;
    var strokeSoundTimestamp0 = null, strokeSoundTimestamp1 = null;
    var cursorID = undefined;
    var mouseMoveTimestamp = Date.now();
    var hmdMoveTimestamp = Date.now();
    var hapticPulseTimestamp = Date.now();
    var equipTimestamp = undefined;
    var dominantHandJoint;
    var dominantHand;
    var tablet = Tablet.getTablet('com.highfidelity.interface.tablet.system');
    var whiteboard = null;
    // Performance Debug
    // 2 / 60.0 *1000
    // 1/ 60.0*1000
    var throttleTimeoutMS = 16.6;
    var hapticTimeoutMS = 140;
    var controllerMapping;
    var drawInterval = null;
    var deletingInterval;
    var activeTriggerPress = false;
    var activeGripPress = false;
    var controllerMappingName = 'Hifi-DrawApp';
    var animationData = {};
    var animationHandlerID;
    var injector;
    var mouseEventsConnected = false;
    var paintSphereDimensions;
    var linePoints = [{x: 0, y: 0, z: 0 }];
    var lineNormals = [DEFAULT_NORMAL, DEFAULT_NORMAL];
    var lineStrokeWidths = [];
    var lineStartPosition;
    var pickRay;
    var desktopActionInProgress = false;
    var polyLine = null;
    var previousLinePoint;
    var previousNormal;
    var previousStrokeWidth;
    var currentLinePoint;
    var currentNormal;
    var currentStrokeWidth;
    var parentJointIndex;
    var wasLastPointOnBoard;
    var whiteboardParts = [];
    var initialLineStartDataReady = false;
    var sphereProperties;
    var whiteboardProperties;
    var whiteBoardIntersectionData;
    var drawingInDesktop;
    var displacementFromStart;
    var laser;

    var PaintSphere = function() {
        _this = this;
    };

    PaintSphere.prototype = {
        preload: function(entityID) {
            _this.entityID = entityID;
            Script.setTimeout(function() {
                var properties = Entities.getEntityProperties(_this.entityID, ['userData','color']);
                _this.color = properties.color;
                _this.texture = JSON.parse(properties.userData).textureURL;
                _this.findWhiteboard();
                readyToDraw = true;
            }, WAIT_FOR_ENTITIES_TO_LOAD_MS);

            dominantHand = MyAvatar.getDominantHand();
            dominantHandJoint = (dominantHand === "right") ? "RightHand" : "LeftHand";
            MyAvatar.dominantHandChanged.connect(_this.handChanged);

            parentJointIndex = MyAvatar.getJointIndex(dominantHandJoint + "Index4");
            if (parentJointIndex === -1) {
                MyAvatar.getJointIndex(dominantHandJoint + "Index3");
            }
            if (parentJointIndex === -1) {
                MyAvatar.getJointIndex(dominantHandJoint);
                print("ERROR: Falling back to dominant hand joint as index finger tip could not be found");
            }

            tablet.tabletShownChanged.connect(_this.tabletShownChanged);
            HMD.displayModeChanged.connect(_this.displayModeChanged);
            Window.domainChanged.connect(_this.domainChanged);

            _this.registerControllerMapping();
            if (HMD.active) {
                HMD.closeTablet();
                _this.setUpHMDMode();
            } else {
                _this.setUpDesktopMode();
            }
            _this.playSound(OPEN_SOUND, OPEN_SOUND_VOLUME, MyAvatar.position, true, false);
        },

        /* PLAY A SOUND: Plays the specified sound at the position of the user's Avatar using the volume and playback 
        mode requested. */
        playSound: function(sound, volume, position, localOnly, loop){
            if (sound.downloaded) {
                if (injector) {
                    injector.stop();
                    injector = null;
                }
                injector = Audio.playSound(sound, {
                    position: position,
                    volume: volume,
                    localOnly: localOnly,
                    loop: loop
                });
            }
        },

        findWhiteboard: function() {
            Entities.findEntities(MyAvatar.position, WHITEBOARD_SEARCH_RADIUS_M).forEach(function(entity) {
                var properties = Entities.getEntityProperties(entity, ['position', "name"]);
                if (properties.name && properties.name === "Whiteboard") {
                    if (whiteboard) {
                        if (Vec3.distance(properties.position, MyAvatar.position) <
                            Vec3.distance(Entities.getEntityProperties(whiteboard, "position").position, MyAvatar.position)) {
                            whiteboard = entity;
                        }
                    } else {
                        whiteboard = entity;
                    }
                }
                if (whiteboard) {
                    whiteboardParts = Entities.getChildrenIDs(whiteboard);
                    whiteboardParts.push(whiteboard);
                }
            });
        },

        draw: function(onBoard) {
            print("DRAW");
            if (!readyToDraw) {
                print("NOT READY TO DRAW");
                return;
            }
            if (Vec3.distance(previousLinePoint, currentLinePoint) < MINIMUM_MOVEMENT_TO_DRAW_M ||
            Vec3.distance(previousLinePoint, currentLinePoint) > MAXIMUM_MOVEMENT_TO_DRAW_M) {
                print("CANNOT DRAW DUE TO DISTANCE FROM LAST POINT");
                return;
            }
            if (onBoard !== wasLastPointOnBoard) { // toggle between on board and air, stop drawing
                print("CANNOT DRAW DUE TO TOGGLE BETWEEN AINR AND BOARD");
                _this.stopDrawing();
                return;
            }
            wasLastPointOnBoard = onBoard;
            var newLine = !polyLine;
            if (newLine) { 
                print("BEGINNING NEW LINE______________");
            }
            var lineProperties = DEFAULT_LINE_PROPERTIES;
            var linePointsCount;
            if (!newLine) { // maybe editing existing line
                var previousLineProperties = Entities.getEntityProperties(polyLine, ['linePoints', 'normals', 
                    'strokeWidths', 'age']);
                linePointsCount = previousLineProperties.linePoints.length;
                if (linePointsCount > MAX_LINE_POINTS) { // too many line points, start new line connected to previous point
                    // print("CONTINUING LINE ************************");
                    newLine = true;
                    if (onBoard) {
                        lineStartPosition = Vec3.subtract(previousLinePoint, Vec3.multiply(previousNormal, 
                            STROKE_FORWARD_OFFSET_M));
                    } else {
                        lineStartPosition = previousLinePoint;
                    }
                    displacementFromStart = Vec3.subtract(currentLinePoint, lineStartPosition);
                    displacementFromStart = Vec3.subtract(displacementFromStart, Vec3.multiply(currentNormal, 
                        STROKE_FORWARD_OFFSET_M));
                    // print("DISPLACEMENT FROM NEW START ", JSON.stringify(displacementFromStart));
                } else { // actually editing the previous line
                    if (injector) {
                        injector.options = {
                            position: currentLinePoint,
                            volume: DRAW_SOUND_VOLUME
                        };
                    }
                    lineProperties.linePoints.push(displacementFromStart);
                    lineProperties.normals.push(currentNormal);
                    lineProperties.strokeWidths.push(currentStrokeWidth);
                    if (!onBoard) {
                        lineProperties.lifetime = previousLineProperties.age + DECAY_TIME_S;
                    }
                    Entities.editEntity(polyLine, {
                        linePoints: lineProperties.linePoints,
                        normals: lineProperties.normals,
                        strokeWidths: lineProperties.strokeWidths,
                        lifetime: lineProperties.lifetime,
                        faceCamera: !onBoard
                    });
                }
            }
            // new line due to just beginning to draw or starting new to continue line with too many points. 
            // All lines have some previous data saved from the initial point, actual new lines have no line points yet
            if (newLine) {
                lineProperties.position = lineStartPosition;
                lineProperties.linePoints = [{x: 0, y: 0, z: 0 }, displacementFromStart];
                // print("NEW LINE POINTS ", JSON.stringify(lineProperties.linePoints));
                lineProperties.normals = [previousNormal, currentNormal];
                lineProperties.strokeWidths = [previousStrokeWidth, currentStrokeWidth];
                lineProperties.color = _this.color;
                lineProperties.textures = _this.texture;
                lineProperties.faceCamera = !onBoard;
                // lineProperties.parentID = whiteboard;
                if (onBoard) {
                    lineProperties.lifetime = -1;
                    polyLine = Entities.addEntity(lineProperties);
                } else {
                    polyLine = Entities.addEntity(lineProperties, 'avatar');
                }
            }
        },

        /* Since polylines don't intersect, find mouse cursor intersection and then cycle through nearby lines to 
        find one with closest point to the intersection, then delete that line */
        deleteOnBoard: function() {
        // search because poly lines don't intersect
            var foundANearbyLine = false;
            var lineToDelete;
            whiteBoardIntersectionData = Entities.findRayIntersection(pickRay, true, [whiteboard]);
            if (whiteBoardIntersectionData.intersects) {
            // print("INTERSECTS WHITEBOARD");
                Entities.findEntitiesByName("Whiteboard Polyline", whiteBoardIntersectionData.intersection, 
                    MAXIMUM_DISTANCE_TO_SEARCH_M).forEach(function(nearbyWhiteboardLine) {
                // print("CHECKING LINE ", nearbyWhiteboardLine);
                    try {
                        var lineProperties = Entities.getEntityProperties(nearbyWhiteboardLine, 
                            ['position', 'linePoints']);
                        var lineBoundingBoxCenter = lineProperties.position;
                        var numberLinePoints = lineProperties.linePoints.length;
                        var shortestDistance = MAXIMUM_DISTANCE_TO_DELETE_M;
                        for (var i = 0; i < numberLinePoints; i++) {
                            var distanceFromIntersection = Vec3.distance(whiteBoardIntersectionData.intersection,
                                Vec3.sum(lineBoundingBoxCenter, lineProperties.linePoints[i]));
                            if (distanceFromIntersection <= shortestDistance) {
                            // print("FOUND A LINE TO DELETE ", nearbyWhiteboardLine);
                                foundANearbyLine = true;
                                lineToDelete = nearbyWhiteboardLine;
                                shortestDistance = DISTANCE_TO_DRAW_IN_FRONT_OF_CAMERA_DESKTOP_M;
                            }
                        }
                    } catch (err) {
                        // this line has already been deleted (race condition) due to not being deleting on a longer 
                        // interval. Currently deleting search happens every mousePressContinue so we can use the event
                        // Ideally it only needs to happen every 200(?) seconds
                    }
                });
                if (foundANearbyLine) {
                    Entities.deleteEntity(lineToDelete);
                }
            }
        },

        /* */
        getCurrentStrokeWidth: function() {
            var paintSphereDimensions = Entities.getEntityProperties(_this.entityID, 'dimensions').dimensions;
            return paintSphereDimensions.x;
        },

        /* */
        getDesktopIntersectionData: function(event) {
            pickRay = Camera.computePickRay(event.x, event.y);
            whiteBoardIntersectionData = Entities.findRayIntersection(pickRay, true, whiteboardParts);
            if (whiteBoardIntersectionData.intersects) {
                var intersectedWhiteboardPartName = Entities.getEntityProperties(whiteBoardIntersectionData.entityID, 
                    'name').name;
                if (intersectedWhiteboardPartName !== "Whiteboard") {
                    if (drawingInDesktop) {
                        _this.stopDrawing();
                    }
                    return -1;
                } else {
                    return 1;
                }
            }
        },

        /* ON MOUSE PRESS: Store the initial point to start line. */
        mousePressed: function(event) {
            if (Settings.getValue("io.highfidelity.isEditing", false) || tablet.tabletShown || 
                _this.getDesktopIntersectionData(event) < 1) {
                return;
            }
            desktopActionInProgress = true;
            if (event.isLeftButton) {
                drawingInDesktop = true;
                var distanceToBoard = Vec3.distance(whiteBoardIntersectionData.intersection, MyAvatar.position);
                if (whiteBoardIntersectionData.intersects && distanceToBoard <= DRAW_ON_BOARD_DISTANCE_DESKTOP_M) {
                    // begin line on board
                    _this.projectPointOntoBoard();
                    wasLastPointOnBoard = true;
                } else { // begin line in air
                    currentLinePoint = Vec3.sum(pickRay.origin, Vec3.multiply(pickRay.direction, 
                        DISTANCE_TO_DRAW_IN_FRONT_OF_CAMERA_DESKTOP_M));
                    currentNormal = DEFAULT_NORMAL;
                    wasLastPointOnBoard = false;
                }
                currentStrokeWidth = _this.getCurrentStrokeWidth();
                _this.playSound(DRAW_SOUND, DRAW_SOUND_VOLUME, currentLinePoint, true, true);
                lineStartPosition = currentLinePoint;
            } else if (event.isMiddleButton) {
                _this.deleteOnBoard();
            }
        }, 

        /* ON MOUSE MOVE: Calculate the next line point and add it to the entity. If there are too many line points, 
    begin a new line. */
        mouseContinueLine: function(event) {
            if (tablet.tabletShown || !desktopActionInProgress|| _this.getDesktopIntersectionData(event) < 1) {
                return;
            }
            var onBoard = true;
            previousLinePoint = currentLinePoint;
            previousNormal = currentNormal;
            previousStrokeWidth = currentStrokeWidth;
            currentStrokeWidth = _this.getCurrentStrokeWidth();
            _this.getDesktopIntersectionData(event);
            if (event.isLeftButton) {
                // THIS IS DUP CODE FROM LINE ... FIX IT
                var distanceToBoard = Vec3.distance(whiteBoardIntersectionData.intersection, MyAvatar.position);
                if (whiteBoardIntersectionData.intersects && distanceToBoard <= DRAW_ON_BOARD_DISTANCE_DESKTOP_M) {
                    // draw on board
                    _this.projectPointOntoBoard();
                    displacementFromStart = Vec3.subtract(currentLinePoint, lineStartPosition);
                    displacementFromStart = Vec3.subtract(displacementFromStart, Vec3.multiply(currentNormal, 
                        STROKE_FORWARD_OFFSET_M));
                } else { // draw in air
                    onBoard = false;
                    currentLinePoint = Vec3.sum(pickRay.origin, Vec3.multiply(pickRay.direction, 
                        DISTANCE_TO_DRAW_IN_FRONT_OF_CAMERA_DESKTOP_M));
                    currentNormal = DEFAULT_NORMAL;
                    displacementFromStart = Vec3.subtract(currentLinePoint, lineStartPosition);
                }
                _this.draw(onBoard);
            } else if (event.isMiddleButton) {
                _this.deleteOnBoard(event, whiteBoardIntersectionData);
            }
        },

        /* ON MOUSE RELEASE: Stop checking distance cursor has moved */
        mouseReleased: function(event) {
            desktopActionInProgress = false;
            drawingInDesktop = false;
            if (event.isLeftButton) {
                _this.stopDrawing();
            }
        },

        /* */
        projectPointOntoBoard: function() {
            currentLinePoint = whiteBoardIntersectionData.intersection;
            var currentWhiteboard = whiteBoardIntersectionData.entityID;
            whiteboardProperties = Entities.getEntityProperties(currentWhiteboard, ['position', 'rotation']);
            currentNormal = Vec3.multiply(-1, Quat.getFront(whiteboardProperties.rotation));
            var distanceWhiteboardPlane = Vec3.dot(currentNormal, whiteboardProperties.position);
            var distanceLocal = Vec3.dot(currentNormal, currentLinePoint) - distanceWhiteboardPlane;
            currentLinePoint = Vec3.subtract(currentLinePoint, Vec3.multiply(distanceLocal, currentNormal));
        },

        /* */
        getHMDLinePointData: function(force) {
            if (!initialLineStartDataReady && !force) {
                print("CANNOT RUN getHMDLinePointData");
                return -1;
            }
            if (initialLineStartDataReady) {
                print("SETTING LINE START DATA AS PREVIOUS");
                previousLinePoint = currentLinePoint;
                previousNormal = currentNormal;
                previousStrokeWidth = currentStrokeWidth;
            }
            sphereProperties = Entities.getEntityProperties(_this.entityID, ['position', 'rotation', 'dimensions']);
            currentLinePoint = sphereProperties.position;
            var sphereFront = Quat.getFront(sphereProperties.rotation);
            var howFarBack = sphereProperties.dimensions.z * HALF;
            var pulledBack = Vec3.multiply(sphereFront, -howFarBack);
            var backedOrigin = Vec3.sum(sphereProperties.position, pulledBack);
            var pickRay = {
                origin: backedOrigin,
                direction: Quat.getFront(sphereProperties.rotation)
            };
            whiteBoardIntersectionData = Entities.findRayIntersection(pickRay, true, whiteboardParts);

            // REMOVE THIS
            if (!initialLineStartDataReady) {
                var laserDistance = whiteBoardIntersectionData.entityID ? Vec3.distance(whiteBoardIntersectionData.intersection, sphereProperties.position) : 1;
                laser = Entities.addEntity({
                    type: 'Model',
                    modelURL: "http://mpassets.highfidelity.com/3d0dd29f-dbe7-4f49-8fef-d95619a4b891-v1/models/laser-beam-red.fbx",
                    name: "WHITEBOARD HMD Beam",
                    parentID: _this.entityID,
                    registrationPoint: {x: 0.5, y: 0.5, z: 1.0},
                    localPosition: {x: 0, y: 0, z: 0},
                    localRotation: Quat.normalize({}),
                    dimensions: {x: 0.01, y: 0.01, z: laserDistance},
                    userData: "{\"grabbableKey\":{\"grabbable\":false}}"
                }, 'avatar');
            }
            // END REMOVE THIS
            
            if (whiteBoardIntersectionData.intersects) {
                var intersectedWhiteboardPartName = Entities.getEntityProperties(whiteBoardIntersectionData.entityID, 
                    'name').name;
                if (intersectedWhiteboardPartName !== "Whiteboard") {
                    if (!initialLineStartDataReady) {
                        _this.stopDrawing();
                    }
                    return -1; // line has moved off board onto selection square
                }
            }
            var status;
            var distanceSphereToBoard = Vec3.distance(whiteBoardIntersectionData.intersection, sphereProperties.position);
            previousStrokeWidth = sphereProperties.dimensions.x;
            if (whiteBoardIntersectionData.intersects && distanceSphereToBoard <= DRAW_ON_BOARD_DISTANCE_HMD_M) {
                _this.projectPointOntoBoard();
                displacementFromStart = Vec3.subtract(currentLinePoint, lineStartPosition);
                displacementFromStart = Vec3.subtract(displacementFromStart, Vec3.multiply(currentNormal, 
                    STROKE_FORWARD_OFFSET_M));
                status = 1; // draw  on board
            } else {
                lineStartPosition = sphereProperties.position;
                previousNormal = DEFAULT_NORMAL;
                status = 2; // draw in air
            }
            if (!initialLineStartDataReady) {
                print("INITIAL DATA SET UP");
            }
            initialLineStartDataReady = true;
            return status;
        },

        /* ON TRIGGER PRESS DRAW: Store the initial point and begin checking distance hand has moved on an interval. If hand 
    has moved more than minimum distance, draw a polyline entity with a lifetime of 1 minute and continue checking 
    hand distance. Every time hand moves more than the minumum, update the polyline with another node. */
        triggerPressed: function() {
            if (tablet.tabletShown || activeGripPress) {
                return;
            }
            var onBoard;
            var status = _this.getHMDLinePointData(true);
            print("INITIAL STATUS: ", status);
            if (status > 0) {
                onBoard = status === 1 ? true : false;
                wasLastPointOnBoard = onBoard;
            } else {
                return;
            }
            activeTriggerPress = true;
            status = null;
            _this.playSound(DRAW_SOUND, DRAW_SOUND_VOLUME, lineStartPosition, true, true);
            drawInterval = Script.setInterval(function() { // for trigger presses, check the position on an interval to draw
                status = _this.getHMDLinePointData(false);
                // print("INTERVAL STATUS : ", status);
                if (status > 0) {
                    onBoard = status === 1 ? true : false;
                } else {
                    return;
                }
                status = null;
                var force = previousLinePoint;
                _this.draw(onBoard);
            }, REPEAT_DISTANCE_CHECK_MS);
        },

        /* ON TRIGGER RELEASE DRAW: Stop checking distance hand has moved */
        triggerReleased: function() {
            if (activeTriggerPress) {
                if (drawInterval) {
                    print("CLEAR TRIGGER INTERVAL");
                    Script.clearInterval(drawInterval);
                    drawInterval = null;
                }
                _this.stopDrawing();
            }
            // REMOVE THIS
            if (laser) {
                Entities.deleteEntity(laser);
            }
            // END REMOVE THIS
        },

        /* ON GRIP PRESS ERASE: Set an interval that finds the nearest line within a maximum distance to paint 
sphere tip and erases it */
        gripPressed: function() {
            if (tablet.tabletShown || activeTriggerPress) {
                return;
            }
            deletingInterval = Script.setInterval(function() {
                var fingerTipPosition = MyAvatar.getJointPosition(parentJointIndex);
                var foundANearbyLine = false;
                var lineToDelete;
                Entities.findEntitiesByName("Draw App Polyline", fingerTipPosition, MAXIMUM_DISTANCE_TO_SEARCH_M)
                    .forEach(function(nearbyDrawAppLine) {
                        var lineProperties = Entities.getEntityProperties(nearbyDrawAppLine, ['position', 'linePoints']);
                        var lineBoundingBoxCenter = lineProperties.position;
                        var numberLinePoints = lineProperties.linePoints.length;
                        var shortestDistance = MAXIMUM_DISTANCE_TO_DELETE_M;
                        for (var i = 0; i < numberLinePoints; i++) {
                            var distanceFromMarkerTip = Vec3.distance(fingerTipPosition,
                                Vec3.sum(lineBoundingBoxCenter, lineProperties.linePoints[i]));
                            if (distanceFromMarkerTip <= shortestDistance) {
                                foundANearbyLine = true;
                                lineToDelete = nearbyDrawAppLine;
                                shortestDistance = DISTANCE_TO_DRAW_IN_FRONT_OF_CAMERA_DESKTOP_M;
                            }
                        }
                    });
                if (foundANearbyLine) {
                    Entities.deleteEntity(lineToDelete);
                }
            }, DELETE_AGAIN_MS);
        },

        /* ON GRIP RELEASE ERASE: Stop the interval that is searching for lines to delete */
        gripReleased: function() {
            if (activeGripPress) {
                activeGripPress = false;
                if (deletingInterval) {
                    Script.clearInterval(deletingInterval);
                    deletingInterval = null;
                }
            }
        },

        /* STOP DRAWING THE CURRENT LINE: stop sound, reset current line variables */
        stopDrawing: function() {
            if (injector) {
                injector.stop();
                injector = null;
            }
            if (!polyLine) {
                return;
            }
            print("STOPPING THAT LINE______________");
            initialLineStartDataReady = false;
            activeTriggerPress = false;
            polyLine = null;
            currentLinePoint = null;
            previousLinePoint = null;
            linePoints = [{x: 0, y: 0, z: 0 }];
            lineNormals = [DEFAULT_NORMAL, DEFAULT_NORMAL];
            lineStrokeWidths = [];
            desktopActionInProgress = false;
        },

        /* GET ANIMATION DATA: Get correct overrides depending on dominant hand */  
        getAnimationData: function() {
            if (dominantHand === "right") {
                animationData.rightHandType = 0;
                animationData.isRightHandGrasp = false;
                animationData.isRightIndexPoint = true;
                animationData.isRightThumbRaise = false;
                animationData.isRightIndexPointAndThumbRaise = false;
            } else {
                animationData.leftHandType = 0;
                animationData.isLeftHandGrasp = false;
                animationData.isLeftIndexPoint = true;
                animationData.isLeftThumbRaise = false;
                animationData.isLeftIndexPointAndThumbRaise = false;
            }
            return animationData;
        },

        /* SET UP HMD MODE: create controller mapping to listen for trigger presses */
        setUpHMDMode: function() {
            if (controllerMapping) {
                controllerMapping.enable();
            }
            animationHandlerID = MyAvatar.addAnimationStateHandler(_this.getAnimationData, []);
            Messages.sendLocalMessage("Hifi-Hand-Disabler", dominantHand);
        },

        /* SET UP DESKTOP MODE: Listen for mouse presses */
        setUpDesktopMode: function() {
            if (!mouseEventsConnected) {
                mouseEventsConnected = true;
                Controller.mousePressEvent.connect(_this.mousePressed);
                Controller.mouseMoveEvent.connect(_this.mouseContinueLine);
                Controller.mouseReleaseEvent.connect(_this.mouseReleased);
            }
        },

        /* CLOSE HMD MODE: Remove controller mapping */
        closeHMDMode: function() {
            if (controllerMapping) {
                controllerMapping.disable();
            }
            Messages.sendLocalMessage("Hifi-Hand-Disabler", "none");
            if (animationHandlerID) {
                animationHandlerID = MyAvatar.removeAnimationStateHandler(animationHandlerID);
            }
        },

        /* CLOSE DESKTOP MODE: Stop listening for mouse presses */
        closeDesktopMode: function() {
            if (mouseEventsConnected) {
                mouseEventsConnected = false;
                Controller.mousePressEvent.disconnect(_this.mousePressed);
                Controller.mouseMoveEvent.disconnect(_this.mouseContinueLine);
                Controller.mouseReleaseEvent.disconnect(_this.mouseReleased);
            }
        },

        /* REGISTER CONTROLLER MAPPING: Listen for controller trigger movements and act when the trigger is pressed or 
    released */
        registerControllerMapping: function() {
            controllerMapping = Controller.newMapping(controllerMappingName);
            controllerMapping.from(Controller.Standard.RT).to(function (value) {
                if (dominantHand === "right") {
                    if (value >= MINIMUM_TRIGGER_PRESS_VALUE && !activeTriggerPress) {
                        activeTriggerPress = true;
                        _this.triggerPressed();
                    } else if (value <= MINIMUM_TRIGGER_PRESS_VALUE && activeTriggerPress) {
                        _this.triggerReleased();
                    }
                }
            });
            controllerMapping.from(Controller.Standard.RightGrip).to(function (value) {
                if (dominantHand === "right") {
                    if (value >= MINIMUM_TRIGGER_PRESS_VALUE && !activeGripPress) {
                        activeGripPress = true;
                        _this.gripPressed();
                    } else if (value <= MINIMUM_TRIGGER_PRESS_VALUE && activeGripPress) {
                        _this.gripReleased();
                    }
                }
            });
            controllerMapping.from(Controller.Standard.LT).to(function (value) {
                if (dominantHand === "left") {
                    if (value >= MINIMUM_TRIGGER_PRESS_VALUE && !activeTriggerPress ) {
                        activeTriggerPress = true;
                        _this.triggerPressed();
                    } else if (value <= MINIMUM_TRIGGER_PRESS_VALUE && activeTriggerPress) {
                        _this.triggerReleased();
                    }
                }
            });
            controllerMapping.from(Controller.Standard.LeftGrip).to(function (value) {
                if (dominantHand === "left") {
                    if (value >= MINIMUM_TRIGGER_PRESS_VALUE && !activeGripPress) {
                        activeGripPress = true;
                        _this.gripPressed();
                    } else if (value <= MINIMUM_TRIGGER_PRESS_VALUE && activeGripPress) {
                        _this.gripReleased();
                    }
                }
            });
        },

        /* WHEN USER DOMAIN CHANGES: Close app to remove paint sphere in hand when leaving the domain */
        domainChanged: function() {
            Script.setTimeout(function() {
                Entities.deleteEntity(_this.entityID);
            }, WAIT_TO_CLEAN_UP_MS);
        },

        /* WHEN USER CHANGES DOMINANT HAND: Switch default hand to place paint sphere in */
    
        handChanged: function() {
            Entities.deleteEntity(_this.entityID);
        },

        /* TABLET SHOWN CHANGED: If draw app is open and tablet is shown, disable it. When the tablet closes while draw
        app is open, reenable it */
        tabletShownChanged: function() {
            if (tablet.tabletShown) {
                if (HMD.active) {
                    if (activeTriggerPress) {
                        _this.triggerReleased();
                    } else if (activeGripPress) {
                        _this.gripReleased();
                    }
                    _this.closeHMDMode();
                } else {
                    _this.mouseReleased();
                    _this.closeDesktopMode();
                }
            } else {
                if (HMD.active) {
                    _this.setUpHMDMode();
                } else {
                    _this.setUpDesktopMode();
                }
            }
        },

        /* WHEN TOGGLING DISPLAY MODE: Set variable to track which method to use to draw lines */
        displayModeChanged: function() {
            if (HMD.active) {
                _this.closeDesktopMode();
                _this.setUpHMDMode();
            } else {
                _this.closeHMDMode();
                _this.setUpDesktopMode();
            }
        },

        /* ON STOPPING THE SCRIPT: Make sure the paint sphere gets deleted and its variable set back to null 
    if applicable. Search for any unreferenced paint spheres and delete if found. */
        unload: function() {
            if (HMD.active) {
                _this.closeHMDMode();
            } else {
                _this.closeDesktopMode();
            }
            if (injector) {
                injector.stop();
                injector = null;
            }
            _this.playSound(CLOSE_SOUND, CLOSE_SOUND_VOLUME, MyAvatar.position, true, false);
            if (controllerMapping) {
                controllerMapping.disable();
            }
            Messages.sendLocalMessage("Hifi-Hand-Disabler", "none");
            if (animationHandlerID) {
                animationHandlerID = MyAvatar.removeAnimationStateHandler(animationHandlerID);
            }
            if (drawInterval) {
                Script.clearInterval(drawInterval);
                drawInterval = null;
            }
            if (deletingInterval) {
                Script.clearInterval(deletingInterval);
                deletingInterval = null;
            }
            tablet.tabletShownChanged.disconnect(_this.tabletShownChanged);
            MyAvatar.dominantHandChanged.disconnect(_this.handChanged);
            HMD.displayModeChanged.disconnect(_this.displayModeChanged);
            Window.domainChanged.disconnect(_this.domainChanged);

            
            // Controller.mousePressEvent.disconnect(_this.mousePressEvent);
            // Controller.mouseMoveEvent.disconnect(_this.mouseMoveEvent);
            // Controller.mouseReleaseEvent.disconnect(_this.mouseReleaseEvent);
            // if (cursorID !== undefined) {
            //     Overlays.deleteOverlay(cursorID);
            // }
        }
    };

    return new PaintSphere();
});