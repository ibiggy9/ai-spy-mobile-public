import React from 'react';
import {
  StyleSheet,
  AppState,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Image,
  Linking,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import tw from 'twrnc';
import { Entypo } from '@expo/vector-icons';
import { FontAwesome5 } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';

export default function Tutorials({ navigation }) {
  const { width, height } = useWindowDimensions();

  return (
    <View style={[tw`bg-black`, { width: width, height: height }]}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Ionicons
          name="arrow-back-circle-outline"
          style={tw`mt-10 p-2 ml-3`}
          size={40}
          color="white"
        />
      </TouchableOpacity>

      <Text style={tw`text-white text-center text-3xl font-bold mb-2`}>
        Link Copy Platform Tutorials
      </Text>

      <View id="grid-vertical" style={tw`flex-col`}>
        <View id="grid-horizontal-card" style={tw`flex-row justify-center`}>
          <TouchableOpacity id="card" style={tw` bg-slate-900 h-50 w-50 m-1 items-center `}>
            <Entypo name="youtube" size={150} color="red" />
            <Text style={tw`text-white text-lg`}>Youtube</Text>
          </TouchableOpacity>

          <TouchableOpacity id="card" style={tw` bg-slate-900 h-50 w-50 m-1 items-center `}>
            <Entypo name="instagram" style={tw`mt-1`} size={150} color="#C14CED" />
            <Text style={tw`text-white text-lg`}>Instagram</Text>
          </TouchableOpacity>
        </View>

        <View id="grid-horizontal-card" style={tw`flex-row justify-center`}>
          <TouchableOpacity id="card" style={tw` bg-slate-900 h-50 w-50 m-1 items-center `}>
            <FontAwesome5 name="tiktok" size={130} style={tw`mt-3`} color="white" />
            <Text style={tw`text-white text-lg`}>TikTok</Text>
          </TouchableOpacity>
          <TouchableOpacity id="card" style={tw` bg-slate-900 h-50 w-50 m-1 items-center `}>
            <Entypo name="facebook" size={150} color="#2B66EE" />
            <Text style={tw`text-white text-lg`}>Facebook</Text>
          </TouchableOpacity>
        </View>

        <View id="grid-horizontal-card" style={tw`flex-row justify-center`}>
          <TouchableOpacity id="card" style={tw` bg-slate-900 h-50 w-50 m-1 items-center `}>
            <Entypo name="twitter" size={150} color="#2B66EE" />
            <Text style={tw`text-white text-lg`}>Twitter / X</Text>
          </TouchableOpacity>

          <TouchableOpacity id="card" style={tw` bg-slate-900 h-50 w-50 m-1 items-center `}>
            <FontAwesome5 name="twitch" size={140} style={tw`mt-3`} color="purple" />
            <Text style={tw`text-white text-lg`}>Twitch</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
