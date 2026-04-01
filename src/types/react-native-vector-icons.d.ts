// Type declarations for react-native-vector-icons
declare module 'react-native-vector-icons/MaterialCommunityIcons' {
  import {Component} from 'react';
  import {TextStyle, TouchableHighlightProps, ViewStyle} from 'react-native';

  export interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: TextStyle | ViewStyle;
  }

  export interface IconButtonProps extends IconProps, TouchableHighlightProps {
    backgroundColor?: string;
    borderRadius?: number;
  }

  export default class Icon extends Component<IconProps> {
    static Button: React.ComponentType<IconButtonProps>;
  }
}

declare module 'react-native-vector-icons/Ionicons' {
  import {Component} from 'react';
  import {TextStyle, TouchableHighlightProps, ViewStyle} from 'react-native';

  export interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: TextStyle | ViewStyle;
  }

  export interface IconButtonProps extends IconProps, TouchableHighlightProps {
    backgroundColor?: string;
    borderRadius?: number;
  }

  export default class Icon extends Component<IconProps> {
    static Button: React.ComponentType<IconButtonProps>;
  }
}
