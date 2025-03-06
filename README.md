# React Native Image Editor UI

JS based image editor ui for react native that relies on reanimated and gesture handler

## Installation

```sh
npm install react-native-image-editor-ui
```

## Usage

```tsx
import {ImageManipulationView, type ImageManipulationMethods} from 'react-native-image-editor-ui';
// This is just an example, you can use some other image editing library
import {ImageManipulator} from 'expo-image-manipulator';

const App = () => {
    const [savedImageUri, setSavedImageUri] = useState<string>();
    const imageManipulationRef = useRef<ImageManipulationMethods>(null);

    const onPressReset = imageManipulationRef.current?.reset();
    const onFlipX = imageManipulationRef.current?.flipX();
    const onFlipY = imageManipulationRef.current?.flipY();
    const onPressRotateRight = imageManipulationRef.current?.rotateRight();

    const onPressSave = useCallback(async () => {
        const editResults = await imageManipulationRef.current?.save();
        if (!editResults) return;
        // You can use any other library
        // The order of transformations matters and follow this
        // Flip -> Rotate -> Crop
        const context = ImageManipulator.manipulate(sampleUri);
        if (editResults.isFlippedX) {
            context.flip('horizontal');
        }
        if (editResults.isFlippedY) {
            context.flip('vertical');
        }
        if (editResults.rotation !== 0) {
            context.rotate(editResults.rotation);
        }
        context.crop({
            height: editResults.cropHeight,
            width: editResults.cropWidth,
            originX: editResults.cropLeftOffset,
            originY: editResults.cropTopOffset,
        });
        const renderResult = await context.renderAsync();
        const image = await renderResult.saveAsync();
        // Do something with the resulting image
        setSavedImageUri(image.uri);
    }, []);

    return (
        <View style={{flex: 1}}>
            {/* you can add your custom buttons */}
            <ImageManipulationView 
                style={{flex: 1}}
                source={{uri: sampleUri}}
                ref={imageManipulationRef}
            />
        </View>
    )
}
```

## TODO

- [ ] Fix rotations for aspect ratios other than 1
- [ ] Improve zooming functionality and moving the image around
- [ ] Document the features and limitations
- [ ] Publish to npm

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
