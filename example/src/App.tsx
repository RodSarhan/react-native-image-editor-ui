import {ImageManipulationView} from 'react-native-image-editor-ui';
import {View, StyleSheet, SafeAreaView, Image} from 'react-native';
import {useState} from 'react';

export default function App() {
    const [savedImageUri, setSavedImageUri] = useState<string | null>(null);
    return (
        <SafeAreaView style={styles.container}>
            <View style={{flex: 1, padding: 10, backgroundColor: '#DDDDDD', paddingVertical: 50}}>
                <ImageManipulationView
                    style={{flex: 1, borderWidth: 1, borderColor: 'blue'}}
                    // source={{uri: 'https://cdn.pixabay.com/photo/2015/04/23/22/00/tree-736885__480.jpg'}}
                    source={{
                        uri: 'https://salesbookingtest.infradigital.com.my/Profile/AppGetProfilePictureById?id=10286',
                    }}
                    onSave={(uri) => {
                        setSavedImageUri(uri);
                    }}
                />
            </View>
            <View style={{flex: 1, padding: 10, backgroundColor: '#DDDDDD', paddingVertical: 50}}>
                {!!savedImageUri && (
                    <Image
                        style={{flex: 1, borderWidth: 1, borderColor: 'blue'}}
                        source={{uri: savedImageUri}}
                        resizeMode='contain'
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({container: {flex: 1}});
