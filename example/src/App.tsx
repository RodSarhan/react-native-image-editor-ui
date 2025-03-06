import {ImageManipulationView, type ImageManipulationMethods} from 'react-native-image-editor-ui';
import {View, StyleSheet, SafeAreaView, Image, TouchableOpacity, Text} from 'react-native';
import {useCallback, useRef, useState} from 'react';
import {ImageManipulator} from 'expo-image-manipulator';
import {MaterialCommunityIcons} from '@expo/vector-icons';

const sampleUri = 'https://salesbookingtest.infradigital.com.my/Profile/AppGetProfilePictureById?id=10286';
// const sampleUri = 'https://www.w3schools.com/w3css/img_lights.jpg';

export default function App() {
    const [savedImageUri, setSavedImageUri] = useState<string>();
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

    const onPressSave = useCallback(async () => {
        const editResults = await imageManipulationRef.current?.save();
        if (!editResults) return;
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
        setSavedImageUri(image.uri);
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            <View style={{backgroundColor: '#DDDDDD', paddingVertical: 10, alignItems: 'center'}}>
                <Text style={{color: '#222222', fontSize: 20, fontWeight: 'bold'}}>Image Editor Test</Text>
            </View>
            <View style={{flex: 1, padding: 10, backgroundColor: '#DDDDDD'}}>
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 10,
                        gap: 10,
                        backgroundColor: '#333333',
                        borderBottomWidth: 1,
                        borderBottomColor: 'white',
                    }}
                >
                    <TouchableOpacity onPress={onPressReset}>
                        <Text style={{color: 'white', fontSize: 16, fontWeight: '500'}}>Reset</Text>
                    </TouchableOpacity>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 15, marginStart: 'auto'}}>
                        <TouchableOpacity onPress={onFlipX}>
                            <MaterialCommunityIcons name='flip-horizontal' size={24} color='white' />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onFlipY}>
                            <MaterialCommunityIcons name='flip-vertical' size={24} color='white' />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onPressRotateRight}>
                            <MaterialCommunityIcons name='rotate-right' size={24} color='white' />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onPressSave}>
                            <MaterialCommunityIcons name='content-save-outline' size={24} color='white' />
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={{flex: 1, backgroundColor: '#222222', padding: 20}}>
                    <ImageManipulationView style={{flex: 1}} source={{uri: sampleUri}} ref={imageManipulationRef} />
                </View>
            </View>
            <View style={{backgroundColor: '#DDDDDD', paddingVertical: 10, alignItems: 'center'}}>
                <Text style={{color: '#222222', fontSize: 20, fontWeight: 'bold'}}>Result</Text>
            </View>
            <View style={{flex: 1, padding: 10, backgroundColor: '#DDDDDD'}}>
                {!!savedImageUri && (
                    <Image style={{flex: 1, borderWidth: 1}} source={{uri: savedImageUri}} resizeMode='contain' />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({container: {flex: 1}});
