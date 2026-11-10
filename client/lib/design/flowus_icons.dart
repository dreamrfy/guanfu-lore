// 真 FlowUs 的图标（M1-T12）——**由 docs/基准/图标/icons-manifest.json 自动生成，不要手改名字**。
//
// 来源：M0-T15 从真 FlowUs 的 [data-icon] 属性收割 57 个 + M0-T18 从数据库界面补 35 个 = 92 个，
// SVG 原文已随仓库放在 `client/assets/icons/`（pubspec 已登记），统一用 flutter_svg 渲染。
//
// 两个坑：
//   1. 这套图标**混了两家**：FlowUs 自研 Ic* 是**填充式**（viewBox 20×20，靠 fill-current 上色）；
//      Lucide 那 9 个是**描边式**（viewBox 24×24，stroke=currentColor）。
//      两家用同一个 ColorFilter(srcIn) 上色都能对，但**不要**把描边图标当填充图标改 viewBox。
//   2. 渲染尺寸是**按位置定的**（16 与 20 是主力：16×16 共 29 个、20×20 共 25 个），
//      所以这里不把尺寸写死，由调用方传（默认 16）。

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// 图标文件名常量（= assets/icons/ 下的文件名，不含扩展名）
abstract final class FlowUsIc {
  static const String luBell = 'Bell';
  static const String add = 'IcAdd';
  static const String addBoard = 'IcAddBoard';
  static const String ai = 'IcAi';
  static const String aiFace = 'IcAiFace';
  static const String aiFill = 'IcAiFill';
  static const String arrowDown01 = 'IcArrowDown01';
  static const String arrowHide = 'IcArrowHide';
  static const String arrowLeft02 = 'IcArrowLeft02';
  static const String arrowRight01 = 'IcArrowRight01';
  static const String arrowRight02 = 'IcArrowRight02';
  static const String arrowShow = 'IcArrowShow';
  static const String ascending = 'IcAscending';
  static const String association = 'IcAssociation';
  static const String avatar = 'IcAvatar';
  static const String blockFullPageOpen = 'IcBlockFullPageOpen';
  static const String blockRightSidebarOpen = 'IcBlockRightSidebarOpen';
  static const String board = 'IcBoard';
  static const String calendar = 'IcCalendar';
  static const String call = 'IcCall';
  static const String capacity = 'IcCapacity';
  static const String chartNumber = 'IcChartNumber';
  static const String check = 'IcCheck';
  static const String check02 = 'IcCheck02';
  static const String checkbox = 'IcCheckbox';
  static const String clockCheck = 'IcClockCheck';
  static const String clockPlus = 'IcClockPlus';
  static const String close = 'IcClose';
  static const String coin = 'IcCoin';
  static const String comment = 'IcComment';
  static const String commentResolved = 'IcCommentResolved';
  static const String descending = 'IcDescending';
  static const String download = 'IcDownload';
  static const String duplicate = 'IcDuplicate';
  static const String edit02 = 'IcEdit02';
  static const String exclusiveChoice = 'IcExclusiveChoice';
  static const String exportPage = 'IcExportPage';
  static const String filter = 'IcFilter';
  static const String folder = 'IcFolder';
  static const String folderContent = 'IcFolderContent';
  static const String formNew = 'IcFormNew';
  static const String formula = 'IcFormula';
  static const String gallery = 'IcGallery';
  static const String generalSetting = 'IcGeneralSetting';
  static const String gift = 'IcGift';
  static const String hideIcon = 'IcHide';
  static const String history = 'IcHistory';
  static const String home = 'IcHome';
  static const String icon = 'IcIcon';
  static const String image = 'IcImage';
  static const String importIcon = 'IcImport';
  static const String info = 'IcInfo';
  static const String inviteHelp = 'IcInviteHelp';
  static const String jumpTo = 'IcJumpTo';
  static const String link = 'IcLink';
  static const String list = 'IcList';
  static const String lock = 'IcLock';
  static const String logOut = 'IcLogOut';
  static const String mail = 'IcMail';
  static const String markdown = 'IcMarkdown';
  static const String member = 'IcMember';
  static const String menu = 'IcMenu';
  static const String menuNext = 'IcMenuNext';
  static const String mindmap = 'IcMindmap';
  static const String more = 'IcMore';
  static const String move = 'IcMove';
  static const String multipleChoice = 'IcMultipleChoice';
  static const String naviDot = 'IcNaviDot';
  static const String naviUnfold = 'IcNaviUnfold';
  static const String pageEmpty = 'IcPageEmpty';
  static const String pageHistory = 'IcPageHistory';
  static const String pages = 'IcPages';
  static const String paperclip = 'IcPaperclip';
  static const String pin = 'IcPin';
  static const String propertyText = 'IcPropertyText';
  static const String question = 'IcQuestion';
  static const String quickAccess = 'IcQuickAccess';
  static const String rollup = 'IcRollup';
  static const String search = 'IcSearch';
  static const String settingapps = 'IcSettingapps';
  static const String settingglobeShare = 'IcSettingglobeShare';
  static const String settingmember = 'IcSettingmember';
  static const String settings = 'IcSettings';
  static const String shoppingCart = 'IcShoppingCart';
  static const String space = 'IcSpace';
  static const String subscribe = 'IcSubscribe';
  static const String table = 'IcTable';
  static const String template = 'IcTemplate';
  static const String timeline = 'IcTimeline';
  static const String title = 'IcTitle';
  static const String trash = 'IcTrash';
  static const String turnInto = 'IcTurnInto';
  static const String upgrade = 'IcUpgrade';
  static const String user = 'IcUser';
  static const String userAdd = 'IcUserAdd';
  static const String userEdit = 'IcUserEdit';
  static const String luMIcPdf = 'MIcPdf';
  static const String luMIcWord = 'MIcWord';
  static const String luMoveHorizontal = 'MoveHorizontal';
  static const String luPresentation = 'Presentation';
  static const String luRedo2 = 'Redo2';
  static const String luSearch = 'Search';
  static const String luStore = 'Store';
  static const String luUndo2 = 'Undo2';

  /// 全部图标名（92 个，按名字排序）
  static const List<String> all = [
    'Bell',
    'IcAdd',
    'IcAddBoard',
    'IcAi',
    'IcAiFace',
    'IcAiFill',
    'IcArrowDown01',
    'IcArrowHide',
    'IcArrowLeft02',
    'IcArrowRight01',
    'IcArrowRight02',
    'IcArrowShow',
    'IcAscending',
    'IcAssociation',
    'IcAvatar',
    'IcBlockFullPageOpen',
    'IcBlockRightSidebarOpen',
    'IcBoard',
    'IcCalendar',
    'IcCall',
    'IcCapacity',
    'IcChartNumber',
    'IcCheck',
    'IcCheck02',
    'IcCheckbox',
    'IcClockCheck',
    'IcClockPlus',
    'IcClose',
    'IcCoin',
    'IcComment',
    'IcCommentResolved',
    'IcDescending',
    'IcDownload',
    'IcDuplicate',
    'IcEdit02',
    'IcExclusiveChoice',
    'IcExportPage',
    'IcFilter',
    'IcFolder',
    'IcFolderContent',
    'IcFormNew',
    'IcFormula',
    'IcGallery',
    'IcGeneralSetting',
    'IcGift',
    'IcHide',
    'IcHistory',
    'IcHome',
    'IcIcon',
    'IcImage',
    'IcImport',
    'IcInfo',
    'IcInviteHelp',
    'IcJumpTo',
    'IcLink',
    'IcList',
    'IcLock',
    'IcLogOut',
    'IcMail',
    'IcMarkdown',
    'IcMember',
    'IcMenu',
    'IcMenuNext',
    'IcMindmap',
    'IcMore',
    'IcMove',
    'IcMultipleChoice',
    'IcNaviDot',
    'IcNaviUnfold',
    'IcPageEmpty',
    'IcPageHistory',
    'IcPages',
    'IcPaperclip',
    'IcPin',
    'IcPropertyText',
    'IcQuestion',
    'IcQuickAccess',
    'IcRollup',
    'IcSearch',
    'IcSettingapps',
    'IcSettingglobeShare',
    'IcSettingmember',
    'IcSettings',
    'IcShoppingCart',
    'IcSpace',
    'IcSubscribe',
    'IcTable',
    'IcTemplate',
    'IcTimeline',
    'IcTitle',
    'IcTrash',
    'IcTurnInto',
    'IcUpgrade',
    'IcUser',
    'IcUserAdd',
    'IcUserEdit',
    'MIcPdf',
    'MIcWord',
    'MoveHorizontal',
    'Presentation',
    'Redo2',
    'Search',
    'Store',
    'Undo2',
  ];
}

/// 渲染一个真 FlowUs 图标
///
/// - [name] 用 [FlowUsIc] 里的常量，别手写字符串（少一个字母就是一个空白圈）
/// - [size] 实测值：16（29 个）/ 20（25 个）/ 12（2 个）/ 14（1 个）
/// - [color] 用 ColorFilter(srcIn) 上色，填充式与描边式都适用
class FlowUsSvgIcon extends StatelessWidget {
  const FlowUsSvgIcon(this.name, {super.key, this.size = 16, this.color, this.tint = true});

  final String name;
  final double size;
  final Color? color;

  /// 是否用单色覆盖（默认 true）。**自带多色/渐变的图标必须传 false**——
  /// ColorFilter(srcIn) 会把渐变压成一个纯色（AI 渐变圆脸就是这么变成蓝圆片的）
  final bool tint;

  @override
  Widget build(BuildContext context) {
    // 不给 color 时**跟随外层 IconTheme**（和 Material Icon 的行为一致）——
    // 否则 SVG 会用自身的 currentColor/黑色，在浅色侧栏里显得又黑又粗（M1-T13 并排对照时发现的）
    final effective = tint ? (color ?? IconTheme.of(context).color) : null;
    return SvgPicture.asset(
      'assets/icons/$name.svg',
      width: size,
      height: size,
      colorFilter: effective == null ? null : ColorFilter.mode(effective, BlendMode.srcIn),
      // 图标就是图标：不让它跟随系统字体缩放变形
      allowDrawingOutsideViewBox: true,
    );
  }
}
