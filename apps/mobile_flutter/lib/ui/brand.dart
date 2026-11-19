import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// The real Converse360 artwork, copied from apps/web/public/brand.
/// `converse360-c.svg` is the green "C" alone (the web's `-mark.svg` is a crop
/// of the wordmark that leaks a sliver of the next letter, so it is not used).
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 64});
  final double size;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
        'assets/brand/converse360-c.svg',
        width: size,
        height: size,
        semanticsLabel: 'Converse360',
      );
}

class BrandWordmark extends StatelessWidget {
  const BrandWordmark({super.key, this.width = 220});
  final double width;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
        'assets/brand/converse360-wordmark.svg',
        width: width,
        semanticsLabel: 'Converse360',
      );
}
