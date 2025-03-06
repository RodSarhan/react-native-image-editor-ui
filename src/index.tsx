import {forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState} from 'react';
import {
    type LayoutRectangle,
    Text,
    TouchableOpacity,
    View,
    type ViewStyle,
    Image,
    type ImageURISource,
} from 'react-native';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated, {clamp, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';

const CROP_PAN_GESTURE_HIT_SLOP = 20;
const CROPPER_BORDER_WIDTH = 2;
const CROPPER_MIN_SIZE = CROP_PAN_GESTURE_HIT_SLOP + CROPPER_BORDER_WIDTH * 2;

export type UseImageStateOptions = {
    source: ImageURISource;
    maxRetries?: number;
    onLoad?: () => void;
    onError?: (errMessage: string) => void;
};

type LoadingState = {
    isSuccess: false;
    isLoading: true;
    isError: false;
    error: undefined;
    retryCount: number;
    aspectRatio: undefined;
    width: undefined;
    height: undefined;
};

type ErrorState = {
    isSuccess: false;
    isLoading: false;
    isError: true;
    error: string;
    retryCount: number;
    aspectRatio: undefined;
    width: undefined;
    height: undefined;
};

type SuccessState = {
    isSuccess: true;
    isLoading: false;
    isError: false;
    error: undefined;
    retryCount: number;
    aspectRatio: number;
    width: number;
    height: number;
};

type State = LoadingState | ErrorState | SuccessState;

type Action =
    | {type: 'SUCCESS'; payload: {width: number; height: number; aspectRatio: number}}
    | {type: 'FAILURE'; payload: string}
    | {type: 'AUTO_RETRY'};

const initialState: State = {
    isLoading: true,
    isSuccess: false,
    isError: false,
    error: undefined,
    retryCount: 0,
    aspectRatio: undefined,
    width: undefined,
    height: undefined,
};

const reducer = (state: State, action: Action) => {
    switch (action.type) {
        case 'SUCCESS': {
            return {
                ...initialState,
                isLoading: false,
                isSuccess: true,
                retryCount: state.retryCount,
                aspectRatio: action.payload.aspectRatio,
                width: action.payload.width,
                height: action.payload.height,
            } as const;
        }
        case 'FAILURE': {
            return {
                ...initialState,
                isLoading: false,
                isError: true,
                error: action.payload,
                retryCount: state.retryCount,
            } as const;
        }
        case 'AUTO_RETRY': {
            return {...initialState, retryCount: state.retryCount + 1} as const;
        }
        default: {
            throw new Error('Unexpected action type');
        }
    }
};

const getImageSize = (
    uri: Parameters<typeof Image.getSize>[0],
    onImageSizeSuccess: Parameters<typeof Image.getSize>[1],
    onImageSizeFailure: Parameters<typeof Image.getSize>[2],
) => {
    let totallyCanceled = false;

    Image.getSize(
        uri,
        (width, height) => {
            if (!totallyCanceled) {
                onImageSizeSuccess(width, height);
            }
        },
        (err) => {
            if (!totallyCanceled) {
                onImageSizeFailure?.(err);
            }
        },
    );

    return {
        cancel: () => {
            totallyCanceled = true;
        },
    };
};

const defaultOnLoad = () => {};
const defaultOnError = () => {};

const useImageState = (options: UseImageStateOptions) => {
    const {source: initialSource, onLoad = defaultOnLoad, onError = defaultOnError, maxRetries = 10} = options;
    if (!initialSource) {
        throw new Error('"source" is required');
    }
    const [state, dispatch] = useReducer(reducer, initialState);

    const onLoadRef = useRef(onLoad);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onLoadRef.current = onLoad;
        onErrorRef.current = onError;
    }, [onError, onLoad]);

    const imageIdOrUri = useMemo(() => {
        const imgIdOrUri = typeof initialSource === 'number' ? initialSource : initialSource.uri;
        if (!imgIdOrUri) {
            throw new Error(`"source" must be a valid URI or resource`);
        }
        return imgIdOrUri;
    }, [initialSource]);

    useEffect(() => {
        let pendingGetImageSize = {cancel: () => {}};

        const handleImageSizeSuccess = (width: number, height: number) => {
            onLoadRef.current();
            dispatch({type: 'SUCCESS', payload: {aspectRatio: width / height, width, height}});
        };

        const handleImageSizeFailure = (err: unknown) => {
            if (state.retryCount >= maxRetries) {
                const errMessage = err instanceof Error ? err.message : String(err);
                onErrorRef.current(errMessage);
                dispatch({type: 'FAILURE', payload: errMessage});
            } else {
                dispatch({type: 'AUTO_RETRY'});
            }
        };

        if (typeof imageIdOrUri === 'string') {
            // Retrieve image dimensions from URI
            pendingGetImageSize = getImageSize(imageIdOrUri, handleImageSizeSuccess, handleImageSizeFailure);
        } else {
            // Retrieve image dimensions from imported resource
            const imageSource = Image.resolveAssetSource(imageIdOrUri);
            if (imageSource) {
                handleImageSizeSuccess(imageSource.width, imageSource.height);
            } else {
                handleImageSizeFailure(new Error('Failed to retrieve image dimensions.'));
            }
        }

        return () => {
            pendingGetImageSize.cancel();
        };
    }, [imageIdOrUri, maxRetries, state.retryCount]);

    return state;
};

type ImageManipulationViewProps = {style?: ViewStyle; source: ImageURISource; onSave: (uri: string) => void};
export const ImageManipulationView: React.FC<ImageManipulationViewProps> = (props) => {
    const {style, source, onSave} = props;
    const imageState = useImageState({source: source, maxRetries: 10});

    if (imageState.isLoading) {
        return (
            <View style={style}>
                <Text>Loading...</Text>
            </View>
        );
    }

    if (imageState.isError) {
        return (
            <View style={style}>
                <Text>Error: {imageState.error}</Text>
            </View>
        );
    }

    return (
        <View style={style}>
            <ImageManipulationCanvas
                source={source}
                imageFileAspectRatio={imageState.aspectRatio}
                imageFileWidth={imageState.width}
                imageFileHeight={imageState.height}
                onSave={onSave}
            />
        </View>
    );
};

type ImageManipulationCanvasProps = {
    source: ImageURISource;
    imageFileAspectRatio: number;
    imageFileWidth: number;
    imageFileHeight: number;
    onSave: (uri: string) => void;
};

const ImageManipulationCanvas: React.FC<ImageManipulationCanvasProps> = (props) => {
    const {source, imageFileAspectRatio, imageFileWidth, imageFileHeight, onSave} = props;
    const [canvasLayout, setCanvasLayout] = useState<LayoutRectangle | undefined>();
    const imageManipulationRef = useRef<ImageManipulationMethods>(null);

    const onPressReset = useCallback(() => {
        imageManipulationRef.current?.reset();
    }, []);
    const onFlipX = useCallback(() => {
        imageManipulationRef.current?.flipX();
    }, []);
    const onFlipY = useCallback(() => {
        imageManipulationRef.current?.flipY();
    }, []);
    const onPressRotateRight = useCallback(() => {
        imageManipulationRef.current?.rotateRight();
    }, []);
    const onPressSave = useCallback(() => {
        imageManipulationRef.current?.save();
    }, []);

    return (
        <>
            <View style={{flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10}}>
                <TouchableOpacity onPress={onPressReset}>
                    <Text>Reset</Text>
                </TouchableOpacity>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginStart: 'auto'}}>
                    <TouchableOpacity onPress={onFlipX}>
                        <Text>Flip X</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onFlipY}>
                        <Text>Flip Y</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onPressRotateRight}>
                        <Text>Rotate</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onPressSave}>
                        <Text>Save</Text>
                    </TouchableOpacity>
                </View>
            </View>
            <GestureHandlerRootView
                style={{flex: 1, width: '100%', overflow: 'hidden', backgroundColor: '#222222'}}
                onLayout={(event) => {
                    setCanvasLayout(event.nativeEvent.layout);
                }}
            >
                {!!canvasLayout && (
                    <ImageManipluationInner
                        canvasHeight={canvasLayout.height}
                        canvasWidth={canvasLayout.width}
                        imageFileAspectRatio={imageFileAspectRatio}
                        imageFileHeight={imageFileHeight}
                        imageFileWidth={imageFileWidth}
                        source={source}
                        key={`${canvasLayout.width}x${canvasLayout.height}x${imageFileWidth}x${imageFileHeight}`}
                        ref={imageManipulationRef}
                        onSave={onSave}
                    />
                )}
            </GestureHandlerRootView>
        </>
    );
};

type ImageManipulationMethods = {
    reset: () => void;
    flipX: () => void;
    flipY: () => void;
    rotateRight: () => void;
    save: () => void;
};

type ImageMinpulationViewProps = {
    source: ImageURISource;
    imageFileAspectRatio: number;
    imageFileWidth: number;
    imageFileHeight: number;
    canvasHeight: number;
    canvasWidth: number;
    onSave: (uri: string) => void;
};

const ImageManipluationRenderFunction: React.ForwardRefRenderFunction<
    ImageManipulationMethods,
    ImageMinpulationViewProps
> = (props, ref) => {
    const {source, imageFileAspectRatio, canvasHeight, canvasWidth, onSave} = props;

    const initialImageLayout = useMemo(() => {
        //contain image inside canvas and center it both horizontally and vertically
        const imageAspectRatio = imageFileAspectRatio;
        const canvasAspectRatio = canvasWidth / canvasHeight;
        let width = canvasWidth;
        let height = canvasHeight;
        let left = 0;
        let top = 0;
        if (imageAspectRatio > canvasAspectRatio) {
            width = canvasWidth;
            height = canvasWidth / imageAspectRatio;
            top = (canvasHeight - height) / 2;
        } else {
            height = canvasHeight;
            width = canvasHeight * imageAspectRatio;
            left = (canvasWidth - width) / 2;
        }
        return {left, top, width, height};
    }, [canvasHeight, canvasWidth, imageFileAspectRatio]);

    const imageAnimatedValues = useSharedValue({
        left: initialImageLayout.left,
        top: initialImageLayout.top,
        width: initialImageLayout.width,
        height: initialImageLayout.height,
        isFlippedX: false,
        isFlippedY: false,
        rotation: 0,
        zoomLevel: 1,
    });

    const cropperAnimatedValues = useSharedValue({
        left: initialImageLayout.left,
        top: initialImageLayout.top,
        width: initialImageLayout.width,
        height: initialImageLayout.height,
    });

    const gestureScale = useSharedValue(1);
    const translationStartX = useSharedValue(0);
    const translationStartY = useSharedValue(0);
    const cropStartX = useSharedValue(0);
    const cropStartY = useSharedValue(0);
    const cropWidthStart = useSharedValue(0);
    const cropHeightStart = useSharedValue(0);
    const verticalEdgeBeingTouched = useSharedValue<'left' | 'right' | null>(null);
    const horizontalEdgeBeingTouched = useSharedValue<'top' | 'bottom' | null>(null);

    const imageAnimatedStyle = useAnimatedStyle(() => {
        const values = imageAnimatedValues.get();
        return {
            position: 'absolute',
            height: values.height,
            width: values.width,
            left: values.left,
            top: values.top,
            transform: [
                {rotate: `${values.rotation}deg`},
                {scaleX: values.isFlippedX ? -1 : 1},
                {scaleY: values.isFlippedY ? -1 : 1},
                {scale: values.zoomLevel},
            ],
        };
    });

    const cropperAnimatedStyle = useAnimatedStyle(() => {
        const values = cropperAnimatedValues.get();
        const verticalEdgeBeingTouchedValue = verticalEdgeBeingTouched.get();
        const horizontalEdgeBeingTouchedValue = horizontalEdgeBeingTouched.get();
        return {
            position: 'absolute',
            left: values.left,
            top: values.top,
            width: values.width,
            height: values.height,
            borderWidth: 2,
            borderLeftColor: verticalEdgeBeingTouchedValue === 'left' ? 'lime' : 'white',
            borderRightColor: verticalEdgeBeingTouchedValue === 'right' ? 'lime' : 'white',
            borderTopColor: horizontalEdgeBeingTouchedValue === 'top' ? 'lime' : 'white',
            borderBottomColor: horizontalEdgeBeingTouchedValue === 'bottom' ? 'lime' : 'white',
        };
    });

    const handleFlipX = useCallback(() => {
        const values = imageAnimatedValues.get();
        if (values.rotation % 180 === 0) {
            imageAnimatedValues.modify((val) => {
                'worklet';
                val.isFlippedX = !val.isFlippedX;
                return val;
            });
        } else {
            imageAnimatedValues.modify((val) => {
                'worklet';
                val.isFlippedY = !val.isFlippedY;
                return val;
            });
        }
    }, [imageAnimatedValues]);

    const handleFlipY = useCallback(() => {
        const values = imageAnimatedValues.get();
        if (values.rotation % 180 === 0) {
            imageAnimatedValues.modify((val) => {
                'worklet';
                val.isFlippedY = !val.isFlippedY;
                return val;
            });
        } else {
            imageAnimatedValues.modify((val) => {
                'worklet';
                val.isFlippedX = !val.isFlippedX;
                return val;
            });
        }
    }, [imageAnimatedValues]);

    const handleRotateRight = useCallback(() => {
        const values = imageAnimatedValues.get();
        const newRotation = values.rotation + 90;
        imageAnimatedValues.modify((val) => {
            'worklet';
            val.rotation = newRotation >= 360 ? 0 : newRotation;
            return val;
        });
    }, [imageAnimatedValues]);

    const handleReset = useCallback(() => {
        imageAnimatedValues.set({
            left: initialImageLayout.left,
            top: initialImageLayout.top,
            width: initialImageLayout.width,
            height: initialImageLayout.height,
            isFlippedX: false,
            isFlippedY: false,
            rotation: 0,
            zoomLevel: 1,
        });
        cropperAnimatedValues.set({
            left: initialImageLayout.left,
            top: initialImageLayout.top,
            width: initialImageLayout.width,
            height: initialImageLayout.height,
        });
    }, [cropperAnimatedValues, imageAnimatedValues, initialImageLayout]);

    const handleSave = useCallback(async () => {
        const cropperValues = cropperAnimatedValues.get();
        const imageValues = imageAnimatedValues.get();
        // check if cropper is inside image
        if (
            !source.uri
            || cropperValues.left < imageValues.left
            || cropperValues.top < imageValues.top
            || cropperValues.left + cropperValues.width > imageValues.left + imageValues.width
            || cropperValues.top + cropperValues.height > imageValues.top + imageValues.height
        ) {
            return;
        }
        // const context = ImageManipulator.manipulate(source.uri);
        // const cropOffsetLeft =
        //   cropperValues.left - imageValues.left;
        // const cropOffsetTop =
        //   cropperValues.top - imageValues.top;
        // const relativeLeftOffset = cropOffsetLeft / imageValues.width;
        // const relativeTopOffset = cropOffsetTop / imageValues.height;
        // const relativeWidth =
        //   cropperValues.width / imageValues.width;
        // const relativeHeight =
        //   cropperValues.height / imageValues.height;

        // const fileOffsetX = relativeLeftOffset * imageFileWidth;
        // const fileOffsetY = relativeTopOffset * imageFileHeight;
        // const fileWidth = relativeWidth * imageFileWidth;
        // const fileHeight = relativeHeight * imageFileHeight;

        // context.crop({
        //   originX: fileOffsetX,
        //   originY: fileOffsetY,
        //   width: fileWidth,
        //   height: fileHeight,
        // });
        // const image = await context.renderAsync();
        // const result = await image.saveAsync({ format: SaveFormat.JPEG });
        // imageModal.show({ uri: result.uri });
        onSave(source.uri);
    }, [cropperAnimatedValues, imageAnimatedValues, source.uri, onSave]);

    useImperativeHandle(
        ref,
        () => ({
            reset: handleReset,
            flipX: handleFlipX,
            flipY: handleFlipY,
            rotateRight: handleRotateRight,
            save: handleSave,
        }),
        [handleReset, handleFlipX, handleFlipY, handleRotateRight, handleSave],
    );

    const pinchGesture = useMemo(() => {
        return Gesture.Pinch()
            .onStart(() => {
                gestureScale.value = imageAnimatedValues.value.zoomLevel;
            })
            .onUpdate((event) => {
                const newZoomLevel = clamp(gestureScale.value * event.scale, 0.1, 2);
                imageAnimatedValues.modify((val) => {
                    val.zoomLevel = newZoomLevel;
                    return val;
                });
            });
    }, [gestureScale, imageAnimatedValues]);

    const panGesture = useMemo(() => {
        return Gesture.Pan()
            .minPointers(1)
            .maxPointers(1)
            .averageTouches(true)
            .onStart(() => {
                translationStartX.value = cropperAnimatedValues.value.left;
                translationStartY.value = cropperAnimatedValues.value.top;
            })
            .onUpdate((event) => {
                const translationX = translationStartX.value + event.translationX;
                const translationY = translationStartY.value + event.translationY;
                const maxRight = initialImageLayout.left + initialImageLayout.width - cropperAnimatedValues.value.width;
                const maxBottom =
                    initialImageLayout.top + initialImageLayout.height - cropperAnimatedValues.value.height;
                cropperAnimatedValues.modify((val) => {
                    val.left = clamp(translationX, initialImageLayout.left, maxRight);
                    val.top = clamp(translationY, initialImageLayout.top, maxBottom);
                    return val;
                });
            });
    }, [
        cropperAnimatedValues,
        initialImageLayout.height,
        initialImageLayout.left,
        initialImageLayout.top,
        initialImageLayout.width,
        translationStartX,
        translationStartY,
    ]);

    const cropGesture = useMemo(() => {
        return Gesture.Pan()
            .manualActivation(true)
            .minPointers(1)
            .maxPointers(1)
            .onTouchesDown((e, manager) => {
                const touch = e.allTouches[0];
                const cropperValues = cropperAnimatedValues.get();
                if (touch) {
                    if (Math.abs(touch.x - cropperValues.left) < CROP_PAN_GESTURE_HIT_SLOP) {
                        manager.activate();
                    }
                    if (Math.abs(touch.x - (cropperValues.left + cropperValues.width)) < CROP_PAN_GESTURE_HIT_SLOP) {
                        manager.activate();
                    }
                    if (Math.abs(touch.y - cropperValues.top) < CROP_PAN_GESTURE_HIT_SLOP) {
                        manager.activate();
                    }
                    if (Math.abs(touch.y - (cropperValues.top + cropperValues.height)) < CROP_PAN_GESTURE_HIT_SLOP) {
                        manager.activate();
                    }
                }
            })
            .onStart((e) => {
                const cropperValues = cropperAnimatedValues.get();
                cropWidthStart.value = cropperValues.width;
                cropHeightStart.value = cropperValues.height;
                cropStartX.value = cropperValues.left;
                cropStartY.value = cropperValues.top;
                if (Math.abs(e.x - cropperValues.left) < CROP_PAN_GESTURE_HIT_SLOP) {
                    verticalEdgeBeingTouched.value = 'left';
                }
                if (Math.abs(e.x - (cropperValues.left + cropperValues.width)) < CROP_PAN_GESTURE_HIT_SLOP) {
                    verticalEdgeBeingTouched.value = 'right';
                }
                if (Math.abs(e.y - cropperValues.top) < CROP_PAN_GESTURE_HIT_SLOP) {
                    horizontalEdgeBeingTouched.value = 'top';
                }
                if (Math.abs(e.y - (cropperValues.top + cropperValues.height)) < CROP_PAN_GESTURE_HIT_SLOP) {
                    horizontalEdgeBeingTouched.value = 'bottom';
                }
            })
            .onUpdate((event) => {
                if (verticalEdgeBeingTouched.value === 'left') {
                    // Maximum movement allowed to the right
                    const maximumAllowedTranlsationX = cropWidthStart.value - CROPPER_MIN_SIZE;
                    // Maximum movement allowed to the left (negative)
                    const minimumAllowedTranslationX = initialImageLayout.left - cropStartX.value;
                    const totalTranslationX = clamp(
                        event.translationX,
                        minimumAllowedTranslationX,
                        maximumAllowedTranlsationX,
                    );
                    const newLeft = cropStartX.value + totalTranslationX;
                    const newWidth = cropWidthStart.value - totalTranslationX;

                    cropperAnimatedValues.modify((val) => {
                        val.width = newWidth;
                        val.left = newLeft;
                        return val;
                    });
                }
                if (verticalEdgeBeingTouched.value === 'right') {
                    // Maximum movement allowed to the right
                    const maximumAllowedTranlsationX =
                        initialImageLayout.left + initialImageLayout.width - (cropStartX.value + cropWidthStart.value);
                    // Maximum movement allowed to the left (negative)
                    const minimumAllowedTranslationX = -cropWidthStart.value + CROPPER_MIN_SIZE;
                    const totalTranslationX = clamp(
                        event.translationX,
                        minimumAllowedTranslationX,
                        maximumAllowedTranlsationX,
                    );
                    const newWidth = cropWidthStart.value + totalTranslationX;
                    cropperAnimatedValues.modify((val) => {
                        val.width = newWidth;
                        return val;
                    });
                }
                if (horizontalEdgeBeingTouched.value === 'top') {
                    // Maximum movement allowed to the bottom
                    const maximumAllowedTranlsationY = cropHeightStart.value - CROPPER_MIN_SIZE;
                    // Maximum movement allowed to the top (negative)
                    const minimumAllowedTranslationY = initialImageLayout.top - cropStartY.value;
                    const totalTranslationY = clamp(
                        event.translationY,
                        minimumAllowedTranslationY,
                        maximumAllowedTranlsationY,
                    );
                    const newTop = cropStartY.value + totalTranslationY;
                    const newHeight = cropHeightStart.value - totalTranslationY;

                    cropperAnimatedValues.modify((val) => {
                        val.height = newHeight;
                        val.top = newTop;
                        return val;
                    });
                }
                if (horizontalEdgeBeingTouched.value === 'bottom') {
                    // Maximum movement allowed to the bottom
                    const maximumAllowedTranlsationY =
                        initialImageLayout.top + initialImageLayout.height - (cropStartY.value + cropHeightStart.value);
                    // Maximum movement allowed to the top (negative)
                    const minimumAllowedTranslationY = -cropHeightStart.value + CROPPER_MIN_SIZE;
                    const totalTranslationY = clamp(
                        event.translationY,
                        minimumAllowedTranslationY,
                        maximumAllowedTranlsationY,
                    );
                    const newHeight = cropHeightStart.value + totalTranslationY;
                    cropperAnimatedValues.modify((val) => {
                        val.height = newHeight;
                        return val;
                    });
                }
            })
            .onFinalize(() => {
                verticalEdgeBeingTouched.value = null;
                horizontalEdgeBeingTouched.value = null;
            });
    }, [
        cropHeightStart,
        cropStartX,
        cropStartY,
        cropWidthStart,
        cropperAnimatedValues,
        horizontalEdgeBeingTouched,
        initialImageLayout.height,
        initialImageLayout.left,
        initialImageLayout.top,
        initialImageLayout.width,
        verticalEdgeBeingTouched,
    ]);

    const composedPanGesture = Gesture.Race(cropGesture, panGesture);
    const composedGesture = Gesture.Simultaneous(pinchGesture, composedPanGesture);
    return (
        <GestureDetector gesture={composedGesture}>
            <View style={{flex: 1, width: '100%', overflow: 'hidden', backgroundColor: '#222222'}}>
                <Animated.Image
                    source={source}
                    style={[{transformOrigin: 'center'}, imageAnimatedStyle]}
                    resizeMode='contain'
                />
                <Animated.View style={cropperAnimatedStyle} />
            </View>
        </GestureDetector>
    );
};

const ImageManipluationInner = forwardRef(ImageManipluationRenderFunction);
