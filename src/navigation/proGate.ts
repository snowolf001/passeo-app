export type ProGateAction = {
  kind: 'none';
};

export type ProGateParams = {
  originRouteName: string;
  originParams?: Record<string, any>;
  action: ProGateAction;
};
