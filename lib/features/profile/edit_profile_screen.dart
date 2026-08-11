import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../core/widgets/makan_avatar.dart';
import '../social/social_providers.dart';

/// ✏️ Edit Profil sosial: gambar, nama paparan, username unik (@handle).
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() =>
      _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _nameController = TextEditingController();
  final _usernameController = TextEditingController();
  File? _newPhoto;
  String? _currentPhotoUrl;
  // SP10: preset avatar bertema. null = tak ubah keadaan asal;
  // '' = kosongkan; id = pilih preset.
  String? _avatarPreset;
  bool _removePhoto = false;
  bool _loaded = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((timeStamp) {
      final doc = ref.read(myUserDocProvider).value;
      _nameController.text = doc?['displayName'] as String? ?? '';
      _usernameController.text = doc?['username'] as String? ?? '';
      setState(() {
        _currentPhotoUrl = doc?['photoUrl'] as String?;
        _avatarPreset = doc?['avatarPreset'] as String?;
        _loaded = true;
      });
    });
  }

  /// SP10: menu avatar — muat naik / pilih avatar MakanMana / guna default.
  Future<void> _avatarMenu() async {
    final l = AppLocalizations.of(context);
    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined,
                  color: AppColors.primaryRed),
              title: Text(l.t('uploadPhoto')),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhoto();
              },
            ),
            ListTile(
              leading:
                  const Icon(Icons.face_outlined, color: AppColors.warmYellow),
              title: Text(l.t('chooseMakanAvatar')),
              onTap: () {
                Navigator.pop(ctx);
                _choosePreset();
              },
            ),
            ListTile(
              leading: const Icon(Icons.refresh),
              title: Text(l.t('useDefaultAvatar')),
              subtitle: Text(l.t('useDefaultAvatarNote'),
                  style: const TextStyle(fontSize: 12)),
              onTap: () {
                Navigator.pop(ctx);
                setState(() {
                  _newPhoto = null;
                  _removePhoto = true;
                  _avatarPreset = '';
                });
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  /// SP10: pemilih 3 preset MakanMana.
  Future<void> _choosePreset() async {
    final l = AppLocalizations.of(context);
    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l.t('chooseMakanAvatar'),
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  for (final preset in kAvatarPresets)
                    InkWell(
                      onTap: () {
                        Navigator.pop(ctx);
                        setState(() {
                          _avatarPreset = preset.id;
                          _newPhoto = null;
                          _removePhoto = true; // preset ganti gambar
                        });
                      },
                      borderRadius: BorderRadius.circular(60),
                      child: Column(
                        children: [
                          MakanAvatar(presetId: preset.id, radius: 34),
                          const SizedBox(height: 8),
                          Text(
                            l.t(preset.labelKey),
                            style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _usernameController.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 512,
        imageQuality: 85,
      );
      if (picked != null && mounted) {
        setState(() {
          _newPhoto = File(picked.path);
          _removePhoto = false; // gambar baharu menang
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _save() async {
    final l = AppLocalizations.of(context);
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    setState(() => _saving = true);
    try {
      var photoUrl = '';
      if (_newPhoto != null) {
        final storageRef = FirebaseStorage.instance.ref(
          'profile_images/$uid/avatar.jpg',
        );
        await storageRef
            .putFile(
              _newPhoto!,
              SettableMetadata(contentType: 'image/jpeg'),
            )
            .timeout(const Duration(seconds: 45));
        photoUrl = await storageRef.getDownloadURL();
      }
      await FirebaseFunctions.instanceFor(
        region: AppConstants.functionsRegion,
      )
          .httpsCallable(
            'updateProfile',
            options:
                HttpsCallableOptions(timeout: const Duration(seconds: 20)),
          )
          .call<Map>({
        'displayName': _nameController.text.trim(),
        'username': _usernameController.text.trim(),
        'photoUrl': photoUrl,
        // SP10: preset avatar + buang gambar. Fungsi lama (belum deploy
        // 10.1) abaikan medan tambahan ini dengan selamat.
        if (_avatarPreset != null) 'avatarPreset': _avatarPreset,
        if (_removePhoto) 'removePhoto': true,
      });
      // SP10: tulis TERUS ke users/{uid} juga (dibenarkan rules — bukan
      // medan protected) supaya avatar sendiri terus betul WALAUPUN
      // fungsi updateProfile versi baharu belum deploy (10.1). Cermin
      // ke public_profiles tetap tanggungjawab pelayan.
      final uid2 = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
      if (uid2.isNotEmpty && (_avatarPreset != null || _removePhoto)) {
        await FirebaseFirestore.instance
            .collection('users')
            .doc(uid2)
            .set({
          if (_avatarPreset != null)
            'avatarPreset': _avatarPreset!.isEmpty
                ? FieldValue.delete()
                : _avatarPreset,
          if (_removePhoto && photoUrl.isEmpty)
            'photoUrl': FieldValue.delete(),
        }, SetOptions(merge: true)).timeout(const Duration(seconds: 10));
      }
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('profileSaved'))),
        );
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e.code == 'already-exists'
                  ? l.t('usernameTaken')
                  : e.message ?? l.t('postFailed'),
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('postFailed'))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('editProfileTitle'))),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
              children: [
                Center(
                  child: Stack(
                    children: [
                      // SP10: pratonton — gambar baharu > gambar sedia
                      // ada (jika tak dibuang) > preset > default.
                      if (_newPhoto != null)
                        CircleAvatar(
                          radius: 52,
                          backgroundColor: AppColors.softYellow,
                          backgroundImage: FileImage(_newPhoto!),
                        )
                      else
                        MakanAvatar(
                          radius: 52,
                          photoUrl: _removePhoto ? null : _currentPhotoUrl,
                          presetId: _avatarPreset,
                          displayName: _nameController.text,
                        ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: InkWell(
                          onTap: _saving ? null : _avatarMenu,
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: const BoxDecoration(
                              color: AppColors.primaryRed,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.photo_camera,
                                size: 18, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  l.t('displayNameLabel'),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: _nameController,
                  maxLength: 30,
                  decoration: InputDecoration(
                    hintText: l.t('displayNameHint'),
                    filled: true,
                    fillColor: context.mm.card,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide:
                          BorderSide(color: context.mm.border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide:
                          BorderSide(color: context.mm.border),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  l.t('usernameLabel'),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: _usernameController,
                  maxLength: 20,
                  decoration: InputDecoration(
                    prefixText: '@',
                    hintText: l.t('usernameHint'),
                    filled: true,
                    fillColor: context.mm.card,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide:
                          BorderSide(color: context.mm.border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide:
                          BorderSide(color: context.mm.border),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(l.t('saveAction')),
                ),
              ],
            ),
    );
  }
}
