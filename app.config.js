module.exports = {
  expo: {
    name: "Arunas Kitchen",
    slug: "mobcook",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/ak.png",
    scheme: "arunaskitchen",
    userInterfaceStyle: "automatic",

    ios: {
      icon: "./assets/expo.icon",
    },

    android: {
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      predictiveBackGestureEnabled: false,
      package: "com.ahome.arunaskitchen",

      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/ak.png",
      },
    },

    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#208AEF",
          image: "./assets/images/splash-icon.png",
          imageWidth: 76,
        },
      ],
      "expo-video",
      "expo-web-browser",
      "expo-notifications",
      "expo-image-picker",
      "@react-native-community/datetimepicker",
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },

    extra: {
      router: {},
        "eas": {
          "projectId": "e18ab6d0-9a60-4990-9a19-e713e08a6f09"
      }
    },
  },
};
